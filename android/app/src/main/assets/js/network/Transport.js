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
    }
    async connect() {
      this.closed = false;
      const session = (await this.client.auth.getSession()).data.session;
      if (session) this.client.realtime.setAuth(session.access_token);
      if (this.channel) await this.client.removeChannel(this.channel).catch(() => {});
      const ch = this.client.channel(this.topic, {
        config: { private: true, broadcast: { self: false, ack: false }, presence: { key: this.selfId } },
      });
      this.channel = ch;
      ch.on("broadcast", { event: "m" }, ({ payload }) => {
        if (!payload) return;
        this.dispatch(payload.t, payload);
      });
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        this.emitPresence(Object.entries(state).map(([key, metas]) => ({ id: key, ...(metas[0] || {}) })));
      });
      return new Promise((resolve) => {
        let settled = false;
        ch.subscribe(async (status) => {
          if (this.closed) return;
          if (status === "SUBSCRIBED") {
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
        if (!this.closed) this.connect();
      }, delay);
    }
    async track(meta) {
      this.meta = { ...this.meta, ...meta };
      if (this.channel && this.status === "online") await this.channel.track({ ...this.meta, at: Date.now() }).catch(() => {});
    }
    send(type, payload = {}) {
      if (!this.channel || this.status !== "online") return false;
      const msg = { ...payload, t: type, from: this.selfId };
      this.sentMessages++;
      this.sentBytes += 64;
      this.channel.send({ type: "broadcast", event: "m", payload: msg }).catch(() => {});
      return true;
    }
    async close() {
      this.closed = true;
      clearTimeout(this.timer);
      this.timer = null;
      if (this.channel) {
        await this.channel.untrack().catch(() => {});
        await this.client.removeChannel(this.channel).catch(() => {});
      }
      this.channel = null;
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
