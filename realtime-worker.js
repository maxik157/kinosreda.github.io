export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const roomName = url.searchParams.get("room") || "beer-shelf";
      const id = env.ROOM.idFromName(roomName);
      return env.ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/state" || url.pathname === "/event") {
      const roomName = url.searchParams.get("room") || "beer-shelf";
      const id = env.ROOM.idFromName(roomName);
      return env.ROOM.get(id).fetch(request);
    }
    return new Response("OK", { status: 200 });
  }
};

export class Room {
  constructor(state) {
    this.state = state;
    this.clients = new Map();
    this.users = new Map();
    this.ladders = new Map();
    this.boardScroll = { target: 0, updatedAt: Date.now() };
    this.beerAdd = { open: false, data: null, updatedAt: Date.now() };
    this.video = { url: "", time: 0, playing: false, open: false, leaderId: "", leaderName: "", updatedAt: Date.now() };
    this.chatSessions = new Map();
    this.chatLoaded = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") {
      await this.ensureChatLoaded();
      if (url.pathname === "/state" && request.method === "GET") {
        const id = url.searchParams.get("id") || "";
        return new Response(
          JSON.stringify({
            type: "state",
            id,
            users: [...this.users.values()],
            ladders: [...this.ladders.values()],
            boardScroll: this.boardScroll,
            beerAdd: this.beerAdd,
            video: this.getVideoState(),
            chat: this.getChatState()
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.pathname === "/event" && request.method === "POST") {
        let data = null;
        try {
          data = await request.json();
        } catch (_) {}
        if (data && typeof data.type === "string") {
          const id = url.searchParams.get("id") || crypto.randomUUID();
          const name = (url.searchParams.get("name") || "Guest").slice(0, 48);
          await this.handleMessage(id, name, data, null);
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("Expected WebSocket", { status: 400 });
    }
    await this.ensureChatLoaded();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.handleSession(server, request);
    return new Response(null, { status: 101, webSocket: client });
  }

  async ensureChatLoaded() {
    if (this.chatLoaded) return;
    this.chatLoaded = true;
    try {
      const stored = await this.state.storage.get("chatStore");
      if (!stored || typeof stored !== "object") return;
      const sessions = Array.isArray(stored.sessions) ? stored.sessions : [];
      sessions.forEach((session) => {
        if (!session || !session.id) return;
        const messages = Array.isArray(session.messages) ? session.messages : [];
        const messageIds = new Set(messages.map((m) => m && m.id).filter(Boolean));
        this.chatSessions.set(String(session.id), {
          id: String(session.id),
          title: String(session.title || "Новый чат").slice(0, 120),
          updatedAt: Number(session.updatedAt) || Date.now(),
          messages,
          messageIds
        });
      });
    } catch (_) {}
  }

  async persistChatState() {
    const sessions = [];
    for (const session of this.chatSessions.values()) {
      sessions.push({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        messages: Array.isArray(session.messages) ? session.messages : []
      });
    }
    try {
      await this.state.storage.put("chatStore", { sessions });
    } catch (_) {}
  }

  getChatState() {
    const sessions = [];
    const messages = {};
    for (const session of this.chatSessions.values()) {
      sessions.push({ id: session.id, title: session.title, updatedAt: session.updatedAt });
      messages[session.id] = Array.isArray(session.messages) ? session.messages : [];
    }
    return { sessions, messages };
  }

  upsertChatSession(session) {
    if (!session || !session.id) return null;
    const id = String(session.id);
    const existing = this.chatSessions.get(id);
    const merged = {
      id,
      title: String(session.title || existing?.title || "Новый чат").slice(0, 120),
      updatedAt: Number(session.updatedAt) || Date.now(),
      messages: existing?.messages || [],
      messageIds: existing?.messageIds || new Set()
    };
    this.chatSessions.set(id, merged);
    return merged;
  }

  addChatMessage(chatId, message) {
    if (!chatId || !message || !message.id) return null;
    const id = String(chatId);
    const session = this.chatSessions.get(id) || this.upsertChatSession({ id });
    if (!session) return null;
    if (!session.messageIds) session.messageIds = new Set();
    if (session.messageIds.has(message.id)) return null;
    session.messageIds.add(message.id);
    const payload = {
      id: String(message.id),
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || ""),
      ts: Number(message.ts) || Date.now()
    };
    session.messages = Array.isArray(session.messages) ? session.messages : [];
    session.messages.push(payload);
    session.messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    session.updatedAt = Math.max(session.updatedAt || 0, payload.ts);
    if (!session.title || session.title === "Новый чат") {
      if (payload.role === "user" && payload.content) {
        session.title = payload.content.slice(0, 42);
      }
    }
    this.chatSessions.set(id, session);
    return payload;
  }

  handleSession(ws, request) {
    ws.accept();
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || crypto.randomUUID();
    const name = (url.searchParams.get("name") || "Guest").slice(0, 48);

    const user = this.users.get(id) || { id, name, x: 0, y: 0, z: 0, yaw: 0 };
    user.name = name;
    this.users.set(id, user);
    this.clients.set(ws, id);

    ws.send(JSON.stringify({
      type: "state",
      id,
      users: [...this.users.values()],
      ladders: [...this.ladders.values()],
      boardScroll: this.boardScroll,
      beerAdd: this.beerAdd,
      video: this.getVideoState(),
      chat: this.getChatState()
    }));
    this.broadcast({ type: "user_join", user }, ws);

    ws.addEventListener("message", async (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (!data || typeof data.type !== "string") return;
      await this.handleMessage(id, name, data, ws);
    });

    const cleanup = () => {
      this.clients.delete(ws);
      this.users.delete(id);
      if (this.ladders.has(id)) {
        this.ladders.delete(id);
        this.broadcast({ type: "ladder", id, action: "remove" }, ws);
      }
      this.broadcast({ type: "user_leave", id }, ws);
    };
    ws.addEventListener("close", cleanup);
    ws.addEventListener("error", cleanup);
  }

  async handleMessage(id, name, data, ws) {
    if (!data || typeof data.type !== "string") return;
    if (data.type === "presence") {
      const target = this.users.get(id) || { id, name, x: 0, y: 0, z: 0, yaw: 0 };
      target.name = String(data.name || target.name || "Guest").slice(0, 48);
      target.x = Number(data.x) || 0;
      target.y = Number(data.y) || 0;
      target.z = Number(data.z) || 0;
      target.yaw = Number(data.yaw) || 0;
      this.users.set(id, target);
      this.broadcast({ type: "presence", user: target }, ws);
      return;
    }
    if (data.type === "ladder") {
      const ladderId = String(data.id || id);
      if (data.action === "remove") {
        this.ladders.delete(ladderId);
        this.broadcast({ type: "ladder", id: ladderId, action: "remove" }, ws);
        return;
      }
      const payload = {
        id: ladderId,
        action: "add",
        position: data.position || { x: 0, y: 0, z: 0 },
        rotationY: Number.isFinite(data.rotationY) ? data.rotationY : 0,
        height: Number.isFinite(data.height) ? data.height : 0,
        width: Number.isFinite(data.width) ? data.width : 0,
        depth: Number.isFinite(data.depth) ? data.depth : 0,
        platformDepth: Number.isFinite(data.platformDepth) ? data.platformDepth : 0
      };
      this.ladders.set(ladderId, payload);
      this.broadcast({ type: "ladder", ...payload }, ws);
      return;
    }
    if (data.type === "board_scroll") {
      const target = Number.isFinite(data.target) ? Number(data.target) : 0;
      this.boardScroll = { target, updatedAt: Date.now() };
      this.broadcast({ type: "board_scroll", target }, ws);
      return;
    }
    if (data.type === "beer_add") {
      const open = Boolean(data.open);
      const payload = {
        open,
        data: data.data || null,
        updatedAt: Date.now()
      };
      this.beerAdd = payload;
      this.broadcast({ type: "beer_add", ...payload }, ws);
      return;
    }
    if (data.type === "chat:session") {
      if (data.session && data.session.id) {
        const session = this.upsertChatSession(data.session);
        await this.persistChatState();
        if (session) {
          this.broadcast({ type: "chat:session", session }, ws);
        }
      }
      return;
    }
    if (data.type === "chat:message") {
      if (data.chatId && data.message) {
        const message = this.addChatMessage(data.chatId, data.message);
        await this.persistChatState();
        if (message) {
          this.broadcast({ type: "chat:message", chatId: String(data.chatId), message }, ws);
        }
      }
      return;
    }
    if (data.type.startsWith("video:")) {
      const now = Date.now();
      if (data.type === "video:claim" || data.type === "video:release") {
        return;
      }
      if (data.type === "video:set") {
        this.video.url = String(data.url || "").slice(0, 2048);
        if (Number.isFinite(data.time)) {
          this.video.time = Number(data.time);
        } else {
          this.video.time = 0;
        }
        this.video.playing = false;
        this.video.updatedAt = now;
      } else if (data.type === "video:open") {
        if (this.video.playing) {
          this.video.time = this.getVideoState().time;
        }
        this.video.open = true;
        this.video.updatedAt = now;
      } else if (data.type === "video:close") {
        if (this.video.playing) {
          this.video.time = this.getVideoState().time;
        }
        this.video.open = false;
        this.video.updatedAt = now;
      } else if (data.type === "video:play") {
        this.video.playing = true;
        if (Number.isFinite(data.time)) this.video.time = Number(data.time);
        this.video.updatedAt = now;
      } else if (data.type === "video:pause") {
        this.video.playing = false;
        if (Number.isFinite(data.time)) this.video.time = Number(data.time);
        this.video.updatedAt = now;
      } else if (data.type === "video:seek") {
        if (Number.isFinite(data.time)) this.video.time = Number(data.time);
        this.video.updatedAt = now;
      }
      this.broadcast({ type: "video", state: this.getVideoState() }, ws);
    }
  }

  getVideoState() {
    if (!this.video.url) {
      return { url: "", time: 0, playing: false, open: this.video.open, leaderId: this.video.leaderId, leaderName: this.video.leaderName };
    }
    let time = this.video.time;
    if (this.video.playing) {
      time += (Date.now() - this.video.updatedAt) / 1000;
    }
    return { url: this.video.url, time, playing: this.video.playing, open: this.video.open, leaderId: this.video.leaderId, leaderName: this.video.leaderName };
  }

  broadcast(message, except) {
    const payload = JSON.stringify(message);
    for (const [client] of this.clients) {
      if (client === except) continue;
      try {
        client.send(payload);
      } catch (_) {}
    }
  }
}
