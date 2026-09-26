// MissionDefinitions + MissionManager. Missions are generated, progressed and paid out by the
// server (see supabase/migrations/*_missions.sql); this module only describes and displays them.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});

  const RARITIES = {
    COMMON: { name: "COMUM", color: "#9e9e9e", rank: 0 },
    UNCOMMON: { name: "INCOMUM", color: "#4caf50", rank: 1 },
    RARE: { name: "RARA", color: "#2f8fff", rank: 2 },
    EPIC: { name: "ÉPICA", color: "#a855f7", rank: 3 },
    LEGENDARY: { name: "LENDÁRIA", color: "#f5b942", rank: 4 },
    MYTHIC: { name: "MÍTICA", color: "#f02f8a", rank: 5 },
    DIVINE: { name: "DIVINA", color: "#ff7a1a", rank: 6 },
  };
  const FAMILIES = { rifle: "fuzis", shotgun: "escopetas", sniper: "rifles de precisão", melee: "armas brancas", bow: "arcos", explosive: "explosivos", pistol: "pistolas" };
  const DIFFICULTIES = { easy: "Fácil", medium: "Médio", hard: "Difícil", nightmare: "Pesadelo" };
  const n = (v) => Number(v || 0).toLocaleString("pt-BR");

  // type → { icon, title(m) }. New mission types only need an entry here and in the SQL generator.
  const MissionDefinitions = {
    KILL: { icon: "☠", title: (m) => `Elimine ${n(m.target)} zumbis` },
    WEAPON: { icon: "⌖", title: (m) => `Elimine ${n(m.target)} zumbis com ${FAMILIES[m.params?.family] || "a arma indicada"}` },
    HEADSHOT: { icon: "◎", title: (m) => `Acerte ${n(m.target)} headshots` },
    SURVIVAL: { icon: "⏳", title: (m) => `Sobreviva a ${n(m.target)} ondas` },
    BOSS: { icon: "♛", title: (m) => (m.target === 1 ? "Derrote 1 chefe (Yeti ou Demônio)" : `Derrote ${n(m.target)} chefes`) },
    MINIBOSS: { icon: "✚", title: (m) => (m.target === 1 ? "Derrote 1 mini-boss" : `Derrote ${n(m.target)} mini-bosses`) },
    DAMAGE: { icon: "✸", title: (m) => `Cause ${n(m.target)} de dano` },
    TEAM: { icon: "✚", title: (m) => (m.target === 1 ? "Reviva 1 aliado" : `Reviva ${n(m.target)} aliados`) },
    MONEY: { icon: "◈", title: (m) => `Ganhe ${n(m.target)} moedas em partidas` },
    NO_DAMAGE: { icon: "⛨", title: (m) => (m.target === 1 ? "Termine 1 onda sem levar dano" : `Termine ${n(m.target)} ondas sem levar dano`) },
    DIFFICULTY: { icon: "☣", title: (m) => `Alcance a onda ${n(m.target)} no ${DIFFICULTIES[m.params?.difficulty] || "Difícil"}` },
    CLASS: { icon: "⚔", title: (m) => `Elimine ${n(m.target)} zumbis usando a classe ${m.params?.className || "indicada"}` },
    MAP: { icon: "⌂", title: (m) => `Alcance a onda ${n(m.target)} em ${m.params?.mapName || "um mapa específico"}` },
    MULTIPLAYER: { icon: "⚑", title: (m) => (m.target === 1 ? "Complete 1 partida multiplayer" : `Complete ${n(m.target)} partidas multiplayer`) },
  };

  function describe(m) {
    const def = MissionDefinitions[m.type] || { icon: "•", title: () => m.type };
    const rarity = RARITIES[m.rarity] || RARITIES.COMMON;
    const rewards = [`+${n(m.rewardCoins)} moedas`, `+${n(m.rewardXp)} XP`];
    if (m.rewardNormal) rewards.push(`+${m.rewardNormal} ticket${m.rewardNormal > 1 ? "s" : ""}`);
    if (m.rewardLucky) rewards.push(`+${m.rewardLucky} Lucky`);
    return { ...m, icon: def.icon, title: def.title(m), rarityName: rarity.name, color: rarity.color, rewards, pct: Math.min(100, (100 * m.progress) / Math.max(1, m.target)) };
  }

  const MissionManager = {
    list: [],
    loading: false,
    error: null,
    listeners: new Set(),
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
    emit(extra) {
      for (const fn of this.listeners) fn(this.list, extra);
    },
    cacheKey() {
      const id = DR.AuthService?.user()?.id;
      return id ? `deadrecoil.missions.${id}` : null;
    },
    loadCache() {
      const key = this.cacheKey();
      if (!key) return;
      try {
        const v = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(v)) this.list = v;
      } catch {}
    },
    // Accepts a fresh list from any server response; reports newly completed missions.
    set(missions, { silent = false } = {}) {
      if (!Array.isArray(missions)) return [];
      const before = new Map(this.list.map((m) => [m.id, m]));
      this.list = missions;
      const key = this.cacheKey();
      if (key)
        try {
          localStorage.setItem(key, JSON.stringify(missions));
        } catch {}
      const done = missions.filter((m) => m.completed && before.has(m.id) && !before.get(m.id).completed);
      if (!silent) this.emit({ completed: done });
      return done;
    },
    async refresh() {
      if (!DR.Backend.isOnline()) {
        this.loadCache();
        this.emit({});
        return this.list;
      }
      this.loading = true;
      this.error = null;
      this.emit({});
      try {
        const r = await DR.MissionRepository.list();
        this.set(r.missions);
        return r;
      } catch (e) {
        this.error = e;
        this.loadCache();
        throw e;
      } finally {
        this.loading = false;
        this.emit({});
      }
    },
    async claim(id) {
      const r = await DR.MissionRepository.claim(id);
      this.set(r.missions, { silent: true });
      this.emit({ claimed: r.claimed });
      return r;
    },
  };

  DR.MissionDefinitions = MissionDefinitions;
  DR.MissionRarities = RARITIES;
  DR.describeMission = describe;
  DR.MissionManager = MissionManager;
})();
