const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const STATE_FILE = process.env.REALTIME_CHAT_STATE_PATH || path.join(__dirname, 'chat-state.json');
const PORT = Number(process.env.REALTIME_CHAT_PORT || 8081);
const MAX_SESSIONS_PER_ROOM = 200;
const MAX_MESSAGES_PER_SESSION = 500;

const rooms = new Map();
let persistTimer = null;

function safeNow() {
  return Date.now();
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    if (!raw) return;
    const data = JSON.parse(raw);
    const storedRooms = data && data.rooms && typeof data.rooms === 'object' ? data.rooms : {};
    Object.keys(storedRooms).forEach((roomName) => {
      const payload = storedRooms[roomName];
      const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      const room = getRoom(roomName);
      sessions.forEach((session) => {
        if (!session || !session.id) return;
        const messages = Array.isArray(session.messages) ? session.messages : [];
        const messageIds = new Set(messages.map((m) => m && m.id).filter(Boolean));
        room.sessions.set(String(session.id), {
          id: String(session.id),
          title: String(session.title || 'Новый чат').slice(0, 120),
          updatedAt: Number(session.updatedAt) || safeNow(),
          messages,
          messageIds
        });
      });
    });
  } catch (_) {}
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistState();
  }, 400);
}

function persistState() {
  try {
    const data = { rooms: {} };
    rooms.forEach((room, roomName) => {
      const sessions = [];
      room.sessions.forEach((session) => {
        sessions.push({
          id: session.id,
          title: session.title,
          updatedAt: session.updatedAt,
          messages: Array.isArray(session.messages) ? session.messages : []
        });
      });
      data.rooms[roomName] = { sessions };
    });
    fs.writeFileSync(STATE_FILE, JSON.stringify(data));
  } catch (_) {}
}

function getRoom(name) {
  const key = String(name || 'ai-chat');
  if (!rooms.has(key)) {
    rooms.set(key, {
      sessions: new Map(),
      clients: new Map()
    });
  }
  return rooms.get(key);
}

function getRoomState(room) {
  const sessions = [];
  const messages = {};
  room.sessions.forEach((session) => {
    sessions.push({ id: session.id, title: session.title, updatedAt: session.updatedAt });
    messages[session.id] = Array.isArray(session.messages) ? session.messages : [];
  });
  return { sessions, messages };
}

function upsertSession(room, session) {
  if (!session || !session.id) return null;
  const id = String(session.id);
  const existing = room.sessions.get(id);
  const merged = {
    id,
    title: String(session.title || existing?.title || 'Новый чат').slice(0, 120),
    updatedAt: Number(session.updatedAt) || safeNow(),
    messages: existing?.messages || [],
    messageIds: existing?.messageIds || new Set()
  };
  room.sessions.set(id, merged);
  pruneSessions(room);
  return merged;
}

function addMessage(room, chatId, message) {
  if (!chatId || !message || !message.id) return null;
  const session = room.sessions.get(String(chatId)) || upsertSession(room, { id: chatId });
  if (!session) return null;
  if (!session.messageIds) session.messageIds = new Set();
  if (session.messageIds.has(message.id)) return null;
  session.messageIds.add(message.id);
  const payload = {
    id: String(message.id),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content || ''),
    ts: Number(message.ts) || safeNow()
  };
  session.messages = Array.isArray(session.messages) ? session.messages : [];
  session.messages.push(payload);
  session.messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    session.messageIds = new Set(session.messages.map((m) => m.id));
  }
  session.updatedAt = Math.max(session.updatedAt || 0, payload.ts);
  if (!session.title || session.title === 'Новый чат') {
    if (payload.role === 'user' && payload.content) {
      session.title = payload.content.slice(0, 42);
    }
  }
  room.sessions.set(session.id, session);
  pruneSessions(room);
  return payload;
}

function pruneSessions(room) {
  if (room.sessions.size <= MAX_SESSIONS_PER_ROOM) return;
  const items = Array.from(room.sessions.values()).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  const toRemove = items.slice(0, room.sessions.size - MAX_SESSIONS_PER_ROOM);
  toRemove.forEach((session) => room.sessions.delete(session.id));
}

function applyEvent(room, data) {
  if (!data || typeof data.type !== 'string') return null;
  if (data.type === 'chat:session') {
    if (data.session && data.session.id) {
      const session = upsertSession(room, data.session);
      schedulePersist();
      if (session) return { type: 'chat:session', session };
    }
    return null;
  }
  if (data.type === 'chat:message') {
    if (data.chatId && data.message) {
      const message = addMessage(room, data.chatId, data.message);
      schedulePersist();
      if (message) return { type: 'chat:message', chatId: String(data.chatId), message };
    }
    return null;
  }
  return null;
}

function broadcast(room, payload, except) {
  const message = JSON.stringify(payload);
  room.clients.forEach((_, client) => {
    if (client === except) return;
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(message); } catch (_) {}
    }
  });
}

loadState();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/state') {
    const roomName = url.searchParams.get('room') || 'ai-chat';
    const id = url.searchParams.get('id') || '';
    const room = getRoom(roomName);
    const payload = {
      type: 'state',
      id,
      chat: getRoomState(room)
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }
  if (url.pathname === '/event' && req.method === 'POST') {
    const roomName = url.searchParams.get('room') || 'ai-chat';
    const room = getRoom(roomName);
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let data = null;
      try { data = JSON.parse(body || '{}'); } catch (_) {}
      const result = applyEvent(room, data);
      if (result) broadcast(room, result);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.writeHead(200);
  res.end('ok');
});

const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const roomName = url.searchParams.get('room') || 'ai-chat';
  const room = getRoom(roomName);

  room.clients.set(ws, true);
  ws.send(JSON.stringify({ type: 'state', id: url.searchParams.get('id') || '', chat: getRoomState(room) }));

  ws.on('message', (raw) => {
    let data = null;
    try { data = JSON.parse(raw.toString()); } catch (_) {}
    if (!data) return;
    const result = applyEvent(room, data);
    if (result) broadcast(room, result, ws);
  });

  const cleanup = () => {
    room.clients.delete(ws);
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

server.listen(PORT, () => {
  console.log(`Realtime chat server on :${PORT}`);
});
