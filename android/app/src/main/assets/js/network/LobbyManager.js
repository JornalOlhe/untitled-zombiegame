// LobbyManager — create / join by code / quick play / ready / host-only start, with presence,
// heartbeats, PLAYER JOINED/LEFT events and host migration. The lobby row on the server is the
// source of truth; the realtime channel only nudges everyone to refresh quickly.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});

  // In-browser lobby backend with the same contract as the SQL functions. Used only with
  // ?net=local (offline development and the automated multi-client tests).
  const LocalLobbyBackend = {
    key: "deadrecoil.local-lobbies",
    me: null,
    read() {
      try {
        return JSON.parse(localStorage.getItem(this.key) || "{}");
      } catch {
        return {};
      }
    },
    write(all) {
      localStorage.setItem(this.key, JSON.stringify(all));
    },
    fail(code) {
      throw new DR.Backend.BackendError(code);
    },
    json(l) {
      return { ...l, players: [...l.players].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => ({ ...p, host: p.userId === l.hostId })) };
    },
    mutate(fn) {
      const all = this.read();
      const out = fn(all);
      this.write(all);
      return out;
    },
    leaveAll(all) {
      for (const l of Object.values(all)) this.removeFrom(l, this.me.id);
    },
    removeFrom(l, uid) {
      const had = l.players.some((p) => p.userId === uid);
      l.players = l.players.filter((p) => p.userId !== uid);
      if (had && l.hostId === uid) {
        if (l.players.length) l.hostId = [...l.players].sort((a, b) => a.joinedAt - b.joinedAt)[0].userId;
        else l.status = "closed";
      }
    },
    add(l) {
      if (!l.players.some((p) => p.userId === this.me.id))
        l.players.push({ userId: this.me.id, username: this.me.name, ready: false, joinedAt: Date.now() + Math.random(), lastSeen: Date.now() });
    },
    create(map = 0, difficulty = "medium", mode = "classic", isPublic = false) {
      return this.mutate((all) => {
        this.leaveAll(all);
        const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
        const l = { id: DR.Backend.uuid(), code, hostId: this.me.id, map, difficulty, mode, status: "open", isPublic, maxPlayers: 4, seed: Math.floor(Math.random() * 2e9), wave: 0, players: [], bans: [] };
        this.add(l);
        all[l.id] = l;
        return this.json(l);
      });
    },
    join(code) {
      return this.mutate((all) => {
        const l = Object.values(all).find((x) => x.code === String(code).trim().toUpperCase() && x.status !== "closed");
        if (!l) this.fail("lobby_not_found");
        if (l.players.some((p) => p.userId === this.me.id)) return this.json(l);
        if (l.bans.includes(this.me.id)) this.fail("lobby_banned");
        if (l.status !== "open") this.fail("lobby_in_game");
        if (l.players.length >= l.maxPlayers) this.fail("lobby_full");
        this.leaveAll(all);
        this.add(l);
        return this.json(l);
      });
    },
    quickPlay(map, difficulty) {
      const all = this.read();
      const l = Object.values(all).find((x) => x.status === "open" && x.isPublic && x.players.length < x.maxPlayers && !x.bans.includes(this.me.id));
      if (l) return { ...this.join(l.code), quickPlay: "joined" };
      return { ...this.create(map ?? 0, difficulty ?? "medium", "classic", true), quickPlay: "created" };
    },
    leave(id) {
      this.mutate((all) => all[id] && this.removeFrom(all[id], this.me.id));
    },
    state(id) {
      const l = this.read()[id];
      if (!l || !l.players.some((p) => p.userId === this.me.id)) this.fail("not_in_lobby");
      return this.json(l);
    },
    ready(id, ready) {
      return this.mutate((all) => {
        const p = all[id]?.players.find((x) => x.userId === this.me.id);
        if (!p) this.fail("not_in_lobby");
        p.ready = !!ready;
        return this.json(all[id]);
      });
    },
    host(all, id) {
      const l = all[id];
      if (!l) this.fail("lobby_not_found");
      if (l.hostId !== this.me.id) this.fail("not_host");
      return l;
    },
    update(id, opts) {
      return this.mutate((all) => {
        const l = this.host(all, id);
        if (l.status !== "open") this.fail("lobby_in_game");
        for (const k of ["map", "difficulty", "mode", "isPublic"]) if (opts[k] != null) l[k] = opts[k];
        for (const p of l.players) if (p.userId !== l.hostId) p.ready = false;
        return this.json(l);
      });
    },
    kick(id, uid) {
      return this.mutate((all) => {
        const l = this.host(all, id);
        l.bans.push(uid);
        this.removeFrom(l, uid);
        return this.json(l);
      });
    },
    start(id) {
      return this.mutate((all) => {
        const l = this.host(all, id);
        if (l.status !== "open") this.fail("lobby_in_game");
        if (l.players.some((p) => p.userId !== l.hostId && !p.ready)) this.fail("players_not_ready");
        l.status = "in_game";
        l.seed = Math.floor(Math.random() * 2e9);
        l.startedAt = Date.now();
        return this.json(l);
      });
    },
    heartbeat(id) {
      return this.mutate((all) => {
        const l = all[id];
        const p = l?.players.find((x) => x.userId === this.me.id);
        if (!p) this.fail("not_in_lobby");
        p.lastSeen = Date.now();
        for (const x of [...l.players]) if (Date.now() - x.lastSeen > 45000) this.removeFrom(l, x.userId);
        const host = l.players.find((x) => x.userId === l.hostId);
        if (!host || Date.now() - host.lastSeen > 15000) {
          const fresh = [...l.players].filter((x) => Date.now() - x.lastSeen < 15000).sort((a, b) => a.joinedAt - b.joinedAt)[0];
          if (fresh) l.hostId = fresh.userId;
        }
        return this.json(l);
      });
    },
    report() {},
    finish(id) {
      return this.mutate((all) => {
        const l = this.host(all, id);
        l.status = "open";
        for (const p of l.players) p.ready = false;
        return this.json(l);
      });
    },
  };

  const LobbyManager = {
    lobby: null,
    transport: null,
    presence: new Map(),
    pings: new Map(),
    listeners: new Set(),
    hbTimer: null,
    pingTimer: null,
    busy: false,
    local: false,
    me: null, // { id, name }

    configure({ local, me }) {
      this.local = !!local;
      this.me = me;
      LocalLobbyBackend.me = me;
    },
    get api() {
      return this.local ? LocalLobbyBackend : DR.LobbyRepository;
    },
    on(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
    emit(type, data) {
      for (const fn of this.listeners) {
        try {
          fn(type, data);
        } catch (e) {
          console.warn("[lobby] listener", e);
        }
      }
    },
    isHost() {
      return !!this.lobby && this.lobby.hostId === this.me?.id;
    },
    connected(userId) {
      return this.presence.has(userId);
    },

    async run(fn) {
      if (this.busy) return null;
      this.busy = true;
      try {
        return await fn();
      } finally {
        this.busy = false;
      }
    },
    async create(opts = {}) {
      return this.run(async () => this.attach(await this.api.create(opts.map ?? 0, opts.difficulty ?? "medium", opts.mode ?? "classic", !!opts.isPublic)));
    },
    async join(code) {
      const clean = String(code || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(clean)) throw new DR.Backend.BackendError("lobby_not_found");
      return this.run(async () => this.attach(await this.api.join(clean)));
    },
    async quickPlay(opts = {}) {
      return this.run(async () => this.attach(await this.api.quickPlay(opts.map ?? null, opts.difficulty ?? null)));
    },
    async setReady(ready) {
      if (!this.lobby) return;
      this.apply(await this.api.ready(this.lobby.id, ready));
      this.poke();
    },
    async update(opts) {
      if (!this.lobby) return;
      this.apply(await this.api.update(this.lobby.id, opts));
      this.poke();
    },
    async kick(userId) {
      if (!this.lobby) return;
      this.apply(await this.api.kick(this.lobby.id, userId));
      this.transport?.send("kick", { userId });
      this.poke();
    },
    async start() {
      if (!this.lobby) return;
      const l = await this.api.start(this.lobby.id);
      this.apply(l);
      this.transport?.send("start", { seed: l.seed });
      this.poke();
      return l;
    },
    async finish() {
      if (!this.lobby || !this.isHost()) return;
      try {
        this.apply(await this.api.finish(this.lobby.id));
        this.poke();
      } catch (e) {
        console.warn("[lobby] finish", e);
      }
    },
    async leave() {
      const l = this.lobby;
      this.detach();
      if (l) await Promise.resolve(this.api.leave(l.id)).catch(() => {});
      this.emit("left", l);
    },

    async attach(lobby) {
      this.detach(true);
      this.lobby = null;
      this.apply(lobby);
      const Transport = this.local ? DR.LocalTransport : DR.SupabaseTransport;
      const t = new Transport(`lobby:${lobby.id}`, this.me.id, DR.AuthService?.client);
      this.transport = t;
      t.meta = { name: this.me.name };
      t.on("lobby", () => this.refresh());
      t.on("start", () => this.refresh());
      t.on("kick", (m) => {
        if (m.userId === this.me.id) {
          this.detach();
          this.emit("kicked", lobby);
        } else this.refresh();
      });
      t.on("ping", (m) => {
        if (m.to === this.me.id) t.send("pong", { to: m.from, sent: m.sent });
      });
      t.on("pong", (m) => {
        if (m.to === this.me.id) {
          this.pings.set(m.from, Math.round(performance.now() - m.sent));
          this.emit("update", this.lobby);
        }
      });
      t.onPresence((list) => {
        const before = new Set(this.presence.keys());
        this.presence = new Map(list.map((p) => [p.id, p]));
        for (const id of this.presence.keys()) if (!before.has(id) && id !== this.me.id) this.emit("presence-join", this.name(id));
        for (const id of before) if (!this.presence.has(id) && id !== this.me.id) this.emit("presence-leave", this.name(id));
        this.emit("update", this.lobby);
      });
      t.onStatus((s) => this.emit("connection", s));
      await t.connect();
      this.poke();
      this.hbTimer = setInterval(() => this.heartbeat(), 5000);
      this.pingTimer = setInterval(() => {
        for (const p of this.lobby?.players || []) if (p.userId !== this.me.id) t.send("ping", { to: p.userId, sent: performance.now() });
      }, 3000);
      this.emit("joined", this.lobby);
      return this.lobby;
    },
    detach(silent = false) {
      clearInterval(this.hbTimer);
      clearInterval(this.pingTimer);
      this.hbTimer = this.pingTimer = null;
      if (this.transport) this.transport.close();
      this.transport = null;
      this.presence = new Map();
      this.pings = new Map();
      if (!silent) this.lobby = null;
    },
    name(userId) {
      return this.lobby?.players.find((p) => p.userId === userId)?.username || this.presence.get(userId)?.name || "Jogador";
    },
    poke() {
      this.transport?.send("lobby", {});
    },
    async refresh() {
      if (!this.lobby) return;
      try {
        this.apply(await this.api.state(this.lobby.id));
      } catch (e) {
        if (e.code === "not_in_lobby") {
          const l = this.lobby;
          this.detach();
          this.emit("kicked", l);
        }
      }
    },
    async heartbeat() {
      if (!this.lobby) return;
      try {
        this.apply(await this.api.heartbeat(this.lobby.id));
        this.emit("heartbeat-ok");
      } catch (e) {
        if (e.code === "not_in_lobby") {
          const l = this.lobby;
          this.detach();
          this.emit("kicked", l);
        } else this.emit("heartbeat-fail", e);
      }
    },
    apply(next) {
      if (!next) return;
      const prev = this.lobby;
      this.lobby = next;
      if (prev) {
        const was = new Map(prev.players.map((p) => [p.userId, p]));
        const now = new Map(next.players.map((p) => [p.userId, p]));
        for (const [id, p] of now) if (!was.has(id)) this.emit("player-joined", p);
        for (const [id, p] of was) if (!now.has(id)) this.emit("player-left", p);
        if (prev.hostId !== next.hostId) this.emit("host-changed", next);
        if (prev.status !== "in_game" && next.status === "in_game") this.emit("start", next);
        if (prev.status === "in_game" && next.status === "open") this.emit("finished", next);
      }
      this.emit("update", next);
    },
  };

  DR.LocalLobbyBackend = LocalLobbyBackend;
  DR.LobbyManager = LobbyManager;
})();
