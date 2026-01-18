export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
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
    this.video = { url: "", time: 0, playing: false, updatedAt: Date.now() };
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.handleSession(server, request);
    return new Response(null, { status: 101, webSocket: client });
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

    ws.send(JSON.stringify({ type: "state", id, users: [...this.users.values()], video: this.getVideoState() }));
    this.broadcast({ type: "user_join", user }, ws);

    ws.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (!data || typeof data.type !== "string") return;
      if (data.type === "presence") {
        const target = this.users.get(id) || user;
        target.name = String(data.name || target.name || "Guest").slice(0, 48);
        target.x = Number(data.x) || 0;
        target.y = Number(data.y) || 0;
        target.z = Number(data.z) || 0;
        target.yaw = Number(data.yaw) || 0;
        this.users.set(id, target);
        this.broadcast({ type: "presence", user: target }, ws);
        return;
      }
      if (data.type.startsWith("video:")) {
        const now = Date.now();
        if (data.type === "video:set") {
          this.video.url = String(data.url || "").slice(0, 2048);
          this.video.time = 0;
          this.video.playing = false;
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
        this.broadcast({ type: "video", state: this.getVideoState() });
      }
    });

    const cleanup = () => {
      this.clients.delete(ws);
      this.users.delete(id);
      this.broadcast({ type: "user_leave", id }, ws);
    };
    ws.addEventListener("close", cleanup);
    ws.addEventListener("error", cleanup);
  }

  getVideoState() {
    if (!this.video.url) {
      return { url: "", time: 0, playing: false };
    }
    let time = this.video.time;
    if (this.video.playing) {
      time += (Date.now() - this.video.updatedAt) / 1000;
    }
    return { url: this.video.url, time, playing: this.video.playing };
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
