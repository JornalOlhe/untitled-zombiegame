// Backend — thin, typed access to the server functions (Supabase RPC) plus connectivity state.
// Repositories group the calls the game makes. Every mutating call carries a request id so
// retries after a flaky connection can never apply twice on the server.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});

  const SERVER_MESSAGES = {
    insufficient_funds: "Saldo insuficiente.",
    invalid_request: "Pedido inválido.",
    invalid_slot: "Slot inválido.",
    empty_slot: "Slot vazio.",
    nothing_pending: "Nenhum item aguardando.",
    max_slots: "Você já tem todos os slots.",
    invalid_item: "Item inválido.",
    run_not_found: "Partida não encontrada no servidor.",
    mission_not_found: "Missão não encontrada.",
    already_claimed: "Recompensa já coletada.",
    mission_incomplete: "Missão ainda não concluída.",
    lobby_not_found: "Lobby não encontrado. Confira o código.",
    lobby_full: "Lobby cheio (4/4).",
    lobby_in_game: "A partida desse lobby já começou.",
    lobby_banned: "Você foi removido desse lobby.",
    not_in_lobby: "Você não está mais nesse lobby.",
    not_host: "Somente o host pode fazer isso.",
    players_not_ready: "Todos os jogadores precisam estar prontos.",
    lobby_not_started: "A partida ainda não começou.",
    username_taken: "Esse nome de usuário já está em uso.",
    invalid_username: "Nome de usuário: 3–20 letras, números ou _.",
    offline_run_too_old: "Partida offline antiga demais para sincronizar.",
    not_authenticated: "Sessão expirada. Entre novamente.",
    network: "Sem conexão com o servidor.",
    timeout: "O servidor demorou para responder.",
  };

  class BackendError extends Error {
    constructor(code, detail) {
      super(SERVER_MESSAGES[code] || detail || "Erro no servidor.");
      this.code = code;
      this.detail = detail;
    }
  }

  const uuid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

  function normalize(error) {
    if (error instanceof BackendError) return error;
    const msg = String(error?.message || error || "");
    const code = String(error?.code || "");
    if (SERVER_MESSAGES[msg]) return new BackendError(msg);
    if (code === "PGRST301" || /jwt expired|invalid jwt|not_authenticated/i.test(msg)) return new BackendError("not_authenticated", msg);
    if (/failed to fetch|networkerror|load failed|network request failed|fetch/i.test(msg)) return new BackendError("network", msg);
    return new BackendError("unknown", msg);
  }

  const Backend = {
    online: navigator.onLine !== false,
    reachable: null,
    listeners: new Set(),
    BackendError,
    uuid,

    get client() {
      return DR.AuthService?.client || null;
    },

    onStatus(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },

    setReachable(ok) {
      const before = this.isOnline();
      this.reachable = ok;
      if (before !== this.isOnline()) for (const fn of this.listeners) fn(this.isOnline());
    },

    isOnline() {
      return this.online && this.reachable !== false && !!this.client;
    },

    async rpc(name, args = {}, { timeout = 12000, retryAuth = true } = {}) {
      if (!this.client) throw new BackendError("network", "backend unavailable");
      let timer;
      const call = this.client.rpc(name, args);
      const timed = new Promise((_, reject) => (timer = setTimeout(() => reject(new BackendError("timeout")), timeout)));
      try {
        const { data, error } = await Promise.race([call, timed]);
        if (error) throw error;
        this.setReachable(true);
        return data;
      } catch (e) {
        const err = normalize(e);
        if (err.code === "network" || err.code === "timeout") this.setReachable(false);
        else if (err.code !== "unknown") this.setReachable(true);
        if (err.code === "not_authenticated" && retryAuth) {
          const { error } = await this.client.auth.refreshSession().catch((x) => ({ error: x }));
          if (!error) return this.rpc(name, args, { timeout, retryAuth: false });
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },

    // Cheap reachability probe used by the reconnect loop.
    async ping() {
      try {
        await this.rpc("username_available", { p_username: "zz_ping" }, { timeout: 6000, retryAuth: false });
        return true;
      } catch (e) {
        return e.code !== "network" && e.code !== "timeout";
      }
    },
  };

  window.addEventListener("online", () => {
    Backend.online = true;
    for (const fn of Backend.listeners) fn(Backend.isOnline());
  });
  window.addEventListener("offline", () => {
    Backend.online = false;
    for (const fn of Backend.listeners) fn(false);
  });

  // ── Repositories ────────────────────────────────────────────────────────────────────────────
  const ProfileRepository = {
    session: () => Backend.rpc("get_session"),
    setUsername: (username, displayName) => Backend.rpc("set_username", { p_username: username, p_display_name: displayName || null }),
    savePreferences: (cosmetics, settings) => Backend.rpc("save_preferences", { p_cosmetics: cosmetics, p_settings: settings }),
  };

  const InventoryRepository = {
    roll: (kind, lucky, payment, requestId = uuid()) => Backend.rpc("economy_roll", { p_kind: kind, p_lucky: !!lucky, p_payment: payment, p_request: requestId }),
    equip: (kind, slot, action, requestId = uuid()) => Backend.rpc("economy_equip", { p_kind: kind, p_slot: slot ?? null, p_action: action, p_request: requestId }),
    buySlot: (requestId = uuid()) => Backend.rpc("economy_buy_slot", { p_request: requestId }),
    buyCosmetic: (id, requestId = uuid()) => Backend.rpc("cosmetic_buy", { p_id: id, p_request: requestId }),
  };

  const RunRepository = {
    start: (mode, map, difficulty, lobbyId = null, requestId = uuid()) =>
      Backend.rpc("run_start", { p_mode: mode, p_map: map, p_difficulty: difficulty, p_lobby: lobbyId, p_request: requestId }),
    report: (runId, report, ended = false, result = null, requestId = uuid()) =>
      Backend.rpc("run_report", { p_run: runId, p_report: report, p_ended: ended, p_result: result, p_request: requestId }),
    submitOffline: (requestId, report) => Backend.rpc("run_submit_offline", { p_request: requestId, p_report: report }),
    mutation: (runId, wave, id, requestId = uuid()) => Backend.rpc("mutation_reward", { p_run: runId, p_wave: wave, p_id: id, p_request: requestId }),
  };

  const MissionRepository = {
    list: () => Backend.rpc("missions_list"),
    claim: (id, requestId = uuid()) => Backend.rpc("mission_claim", { p_mission: id, p_request: requestId }),
  };

  const LobbyRepository = {
    create: (map, difficulty, mode, isPublic) => Backend.rpc("lobby_create", { p_map: map, p_difficulty: difficulty, p_mode: mode, p_public: !!isPublic }),
    join: (code) => Backend.rpc("lobby_join", { p_code: code }),
    quickPlay: (map = null, difficulty = null) => Backend.rpc("lobby_quick_play", { p_map: map, p_difficulty: difficulty }),
    leave: (id) => Backend.rpc("lobby_leave", { p_lobby: id }),
    state: (id) => Backend.rpc("lobby_state", { p_lobby: id }),
    ready: (id, ready) => Backend.rpc("lobby_set_ready", { p_lobby: id, p_ready: !!ready }),
    update: (id, opts) =>
      Backend.rpc("lobby_update", { p_lobby: id, p_map: opts.map ?? null, p_difficulty: opts.difficulty ?? null, p_mode: opts.mode ?? null, p_public: opts.isPublic ?? null }),
    kick: (id, userId) => Backend.rpc("lobby_kick", { p_lobby: id, p_user: userId }),
    start: (id) => Backend.rpc("lobby_start", { p_lobby: id }),
    heartbeat: (id) => Backend.rpc("lobby_heartbeat", { p_lobby: id }, { timeout: 8000 }),
    report: (id, wave, tallies) => Backend.rpc("lobby_report", { p_lobby: id, p_wave: wave, p_tallies: tallies }, { timeout: 8000 }),
    finish: (id) => Backend.rpc("lobby_finish", { p_lobby: id }),
  };

  // Offline runs of a signed-in player, kept per user until the server accepts them.
  const OfflineQueue = {
    key(userId) {
      return `deadrecoil.offline-runs.${userId}`;
    },
    list(userId) {
      try {
        const v = JSON.parse(localStorage.getItem(this.key(userId)) || "[]");
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    },
    push(userId, report) {
      const all = this.list(userId);
      all.push({ requestId: uuid(), report: { ...report, endedAt: new Date().toISOString() } });
      try {
        localStorage.setItem(this.key(userId), JSON.stringify(all.slice(-20)));
      } catch {}
    },
    async flush(userId) {
      const pending = this.list(userId);
      let last = null;
      const keep = [];
      for (const item of pending) {
        try {
          last = await RunRepository.submitOffline(item.requestId, item.report);
        } catch (e) {
          if (e.code === "network" || e.code === "timeout" || e.code === "not_authenticated") keep.push(item);
          // Any other refusal (too old, invalid) is final: drop it.
        }
      }
      try {
        if (keep.length) localStorage.setItem(this.key(userId), JSON.stringify(keep));
        else localStorage.removeItem(this.key(userId));
      } catch {}
      return { synced: pending.length - keep.length, pending: keep.length, last };
    },
  };

  DR.Backend = Backend;
  DR.ProfileRepository = ProfileRepository;
  DR.InventoryRepository = InventoryRepository;
  DR.RunRepository = RunRepository;
  DR.MissionRepository = MissionRepository;
  DR.LobbyRepository = LobbyRepository;
  DR.OfflineQueue = OfflineQueue;
})();
