// NetworkManager transports. One channel per lobby carries lobby signals and in-match traffic.
//   SupabaseTransport — private Realtime channel "lobby:<id>" (RLS: lobby members only),
//                       Broadcast for messages, Presence for who is connected.
//   LocalTransport    — BroadcastChannel between tabs of the same browser (offline dev/tests).
// Both expose: connect(), send(type, payload), on(type, fn), onStatus(fn), onPresence(fn),
// track(meta), close(). Status: "connecting" | "online" | "reconnecting" | "closed".
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});

  class BaseTransport {
    constructor(topic, selfId) {
      this.topic = topic;
      this.selfId = selfId;
      this.handlers = new Map();
      this.statusFns = new Set();
      this.presenceFns = new Set();
      this.status = "connecting";
      this.meta = {};
      this.sentBytes = 0;
      this.sentMessages = 0;
    }
    on(type, fn) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type).add(fn);
      return () => this.handlers.get(type)?.delete(fn);
    }
    onStatus(fn) {
      this.statusFns.add(fn);
      return () => this.statusFns.delete(fn);
    }
    onPresence(fn) {
      this.presenceFns.add(fn);
      return () => this.presenceFns.delete(fn);
    }
    setStatus(s) {
      if (s === this.status) return;
      this.status = s;
      for (const fn of this.statusFns) fn(s);
    }
    dispatch(type, payload) {
      if (payload && payload.from === this.selfId) return;
      const set = this.handlers.get(type);
      if (set) for (const fn of set) fn(payload);
      const any = this.handlers.get("*");
      if (any) for (const fn of any) fn(type, payload);
    }
    emitPresence(list) {
      for (const fn of this.presenceFns) fn(list);
    }
  }

  class SupabaseTransport extends BaseTransport {
    constructor(topic, selfId, client) {
      super(topic, selfId);
      this.client = client;
      this.channel = null;
      this.retry = 0;
      this.closed = false;
      this.timer = null;
      this.attempt = 0;
    }
    async connect() {
      this.closed = false;
      const attempt = ++this.attempt;
      clearTimeout(this.timer);
      this.timer = null;

      let session;
      try {
        session = (await this.client.auth.getSession()).data.session;
      } catch {
        if (!this.closed && attempt === this.attempt) {
          this.setStatus("reconnecting");
          this.scheduleReconnect();
        }
        return false;
      }
      if (this.closed || attempt !== this.attempt) return false;
      if (session) this.client.realtime.setAuth(session.access_token);

      // Detach first: removeChannel() emits CLOSED. A stale CLOSED callback must never schedule
      // another reconnect after a replacement channel has already become healthy.
      if (this.channel) {
        const old = this.channel;
        this.channel = null;
        await this.client.removeChannel(old).catch(() => {});
      }
      if (this.closed || attempt !== this.attempt) return false;

      const ch = this.client.channel(this.topic, {
        config: { private: true, broadcast: { self: false, ack: false }, presence: { key: this.selfId } },
      });
      this.channel = ch;
      ch.on("broadcast", { event: "m" }, ({ payload }) => {
        if (!payload || this.closed || this.channel !== ch || attempt !== this.attempt) return;
        this.dispatch(payload.t, payload);
      });
      ch.on("presence", { event: "sync" }, () => {
        if (this.closed || this.channel !== ch || attempt !== this.attempt) return;
        const state = ch.presenceState();
        this.emitPresence(Object.entries(state).map(([key, metas]) => ({ id: key, ...(metas[0] || {}) })));
      });
      return new Promise((resolve) => {
        let settled = false;
        ch.subscribe(async (status) => {
          if (this.closed || this.channel !== ch || attempt !== this.attempt) return;
          if (status === "SUBSCRIBED") {
            clearTimeout(this.timer);
            this.timer = null;
            this.retry = 0;
            this.setStatus("online");
            await ch.track({ ...this.meta, at: Date.now() }).catch(() => {});
            if (!settled) (settled = true), resolve(true);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            this.setStatus("reconnecting");
            this.scheduleReconnect();
            if (!settled) (settled = true), resolve(false);
          }
        });
      });
    }
    scheduleReconnect() {
      if (this.closed || this.timer) return;
      const delay = Math.min(8000, 600 * 2 ** this.retry++);
      this.timer = setTimeout(() => {
        this.timer = null;
        if (!this.closed) this.connect().catch(() => this.scheduleReconnect());
      }, delay);
    }
    async track(meta) {
      this.meta = { ...this.meta, ...meta };
      const ch = this.channel;
      if (ch && this.status === "online") await ch.track({ ...this.meta, at: Date.now() }).catch(() => {});
    }
    send(type, payload = {}) {
      const ch = this.channel;
      if (!ch || this.status !== "online") return false;
      const msg = { ...payload, t: type, from: this.selfId };
      this.sentMessages++;
      this.sentBytes += 64;
      Promise.resolve(ch.send({ type: "broadcast", event: "m", payload: msg })).catch(() => {
        if (!this.closed && this.channel === ch) {
          this.setStatus("reconnecting");
          this.scheduleReconnect();
        }
      });
      return true;
    }
    async close() {
      this.closed = true;
      this.attempt++;
      clearTimeout(this.timer);
      this.timer = null;
      const ch = this.channel;
      this.channel = null;
      if (ch) {
        await ch.untrack().catch(() => {});
        await this.client.removeChannel(ch).catch(() => {});
      }
      this.setStatus("closed");
    }
  }

  class LocalTransport extends BaseTransport {
    constructor(topic, selfId) {
      super(topic, selfId);
      this.bc = null;
      this.peers = new Map();
      this.beat = null;
      this.offline = false; // tests can simulate a dropped connection
    }
    async connect() {
      this.bc = new BroadcastChannel(`dr-net:${this.topic}`);
      this.bc.onmessage = (e) => {
        if (this.offline) return;
        const msg = e.data;
        if (!msg) return;
        if (msg.t === "__presence") {
          this.peers.set(msg.from, { id: msg.from, ...msg.meta, seen: performance.now() });
          this.flushPresence();
          return;
        }
        if (msg.t === "__leave") {
          this.peers.delete(msg.from);
          this.flushPresence();
          return;
        }
        this.dispatch(msg.t, msg);
      };
      this.beat = setInterval(() => {
        if (this.offline) return;
        this.bc.postMessage({ t: "__presence", from: this.selfId, meta: this.meta });
        const now = performance.now();
        let changed = false;
        for (const [id, p] of this.peers) if (now - p.seen > 4000) this.peers.delete(id), (changed = true);
        if (changed) this.flushPresence();
      }, 700);
      this.setStatus("online");
      this.bc.postMessage({ t: "__presence", from: this.selfId, meta: this.meta });
      return true;
    }
    flushPresence() {
      this.emitPresence([{ id: this.selfId, ...this.meta }, ...this.peers.values()]);
    }
    async track(meta) {
      this.meta = { ...this.meta, ...meta };
      this.bc?.postMessage({ t: "__presence", from: this.selfId, meta: this.meta });
      this.flushPresence();
    }
    setOffline(v) {
      this.offline = v;
      this.setStatus(v ? "reconnecting" : "online");
      if (!v) this.bc.postMessage({ t: "__presence", from: this.selfId, meta: this.meta });
    }
    send(type, payload = {}) {
      if (!this.bc || this.offline) return false;
      this.sentMessages++;
      this.bc.postMessage({ ...payload, t: type, from: this.selfId });
      return true;
    }
    async close() {
      clearInterval(this.beat);
      if (this.bc) {
        this.bc.postMessage({ t: "__leave", from: this.selfId });
        this.bc.close();
      }
      this.bc = null;
      this.setStatus("closed");
    }
  }

  DR.SupabaseTransport = SupabaseTransport;
  DR.LocalTransport = LocalTransport;
})();
