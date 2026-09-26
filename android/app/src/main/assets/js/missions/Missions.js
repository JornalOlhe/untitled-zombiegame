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
  const hours = (sec) => {
    const m = Math.round(Number(sec || 0) / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ""}` : `${m} min`;
  };
  const BOSS_NAMES = { yeti: "o Yeti", demon: "o Demônio", mutant: "o Mutante", quarterback: "o Quarterback" };

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
    PLAYTIME: { icon: "◷", title: (m) => `Jogue por ${hours(m.target)}`, value: hours },
    MATCHES: { icon: "▶", title: (m) => (m.target === 1 ? "Termine 1 partida" : `Termine ${n(m.target)} partidas`) },
    FINAL: { icon: "★", title: (m) => (m.category === "weekly" ? "Complete as 6 missões semanais" : "Complete as 6 missões diárias") },
    REACH_WAVE: { icon: "≋", title: (m) => `Alcance a onda ${n(m.target)}` },
    BOSS_KIND: { icon: "♛", title: (m) => `Derrote ${BOSS_NAMES[m.params?.kind] || "o chefe indicado"}` },
    LEVEL: { icon: "▲", title: (m) => `Chegue ao nível ${n(m.target)}` },
    ENEMY: { icon: "☠", title: (m) => `Elimine ${n(m.target)} ${m.params?.name || "inimigos indicados"}` },
  };
  const CATEGORIES = {
    daily: { name: "DIÁRIAS", short: "Diária" },
    weekly: { name: "SEMANAIS", short: "Semanal" },
    unique: { name: "ÚNICAS", short: "Única" },
  };

  function describe(m) {
    const def = MissionDefinitions[m.type] || { icon: "•", title: () => m.type };
    const rarity = RARITIES[m.rarity] || RARITIES.COMMON;
    const rewards = [`+${n(m.rewardCoins)} moedas`, `+${n(m.rewardXp)} XP`];
    if (m.rewardNormal) rewards.push(`+${m.rewardNormal} ticket${m.rewardNormal > 1 ? "s" : ""}`);
    if (m.rewardLucky) rewards.push(`+${m.rewardLucky} Lucky`);
    const value = def.value || n;
    return {
      ...m, icon: def.icon, title: def.title(m), rarityName: rarity.name, color: rarity.color, rewards,
      progressText: `${value(m.progress)} / ${value(m.target)}`,
      pct: Math.min(100, (100 * m.progress) / Math.max(1, m.target)),
    };
  }

  const MissionManager = {
    list: [],
    meta: null,
    metaAt: 0,
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
      const done = missions.filter((m) => m.completed && !m.claimed && before.has(m.id) && !before.get(m.id).completed);
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
        this.setMeta(r.meta);
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
    setMeta(meta) {
      if (!meta) return;
      this.meta = meta;
      this.metaAt = Date.now();
    },
    // Server clock, so a wrong device clock never shows a wrong countdown.
    endsIn(category) {
      const end = this.meta?.[category === "weekly" ? "weeklyEnds" : "dailyEnds"];
      if (!end || !this.meta.now) return null;
      return Math.max(0, Date.parse(end) - Date.parse(this.meta.now) - (Date.now() - this.metaAt));
    },
    of(category) {
      return this.list.filter((m) => m.category === category);
    },
    claimable() {
      return this.list.filter((m) => m.completed && !m.claimed).length;
    },
    async claim(id) {
      const r = await DR.MissionRepository.claim(id);
      this.setMeta(r.meta);
      this.set(r.missions, { silent: true });
      this.emit({ claimed: r.claimed });
      return r;
    },
  };

  // Index (bestiary): kills per enemy type, milestones and rewards come from the server.
  const ENEMIES = {
    zombie: { name: "Zumbi", desc: "O infectado comum. Lento, mas nunca sozinho." },
    skeleton: { name: "Esqueleto", desc: "Carne quase toda consumida. Rápido e frágil." },
    crawler: { name: "Rastejante", desc: "Arrasta o que sobrou do corpo pelo chão." },
    constructor: { name: "Construtor", desc: "Operário resistente, ainda com o capacete." },
    cyborg: { name: "Ciborgue", desc: "Implantes militares mantêm o corpo de pé." },
    swat: { name: "SWAT", desc: "A blindagem da tropa de choque ainda aguenta tiros." },
    screamer: { name: "Screamer", desc: "O grito atrai e enfurece a horda." },
    brute: { name: "Brute", desc: "Massa muscular deformada. Derruba barricadas." },
    stalker: { name: "Stalker", desc: "Caça pelas sombras e ataca pelos flancos." },
    parasite_host: { name: "Hospedeiro", desc: "Ao morrer, libera parasitas." },
    tank: { name: "Tank", desc: "Uma parede de carne. Traga munição pesada." },
    parasite: { name: "Parasita", desc: "Pequeno, veloz e sempre em grupo." },
    quarterback: { name: "Quarterback", desc: "Mini-boss. Investidas brutais em linha reta." },
    mutant: { name: "Mutante", desc: "Mini-boss. O experimento que escapou do laboratório." },
    yeti: { name: "Yeti", desc: "Chefe. O terror da nevasca." },
    demon: { name: "Demônio", desc: "Chefe. O senhor do inferno." },
  };
  const Bestiary = {
    list: [],
    loading: false,
    listeners: new Set(),
    onChange(fn) {
      this.listeners.add(fn);
    },
    emit() {
      for (const fn of this.listeners) fn(this.list);
    },
    info(key) {
      return ENEMIES[key] || { name: key, desc: "" };
    },
    claimable() {
      return this.list.reduce((a, e) => a + (e.claimable > 0 ? 1 : 0), 0);
    },
    cacheKey() {
      const id = DR.AuthService?.user()?.id;
      return id ? `deadrecoil.bestiary.${id}` : null;
    },
    set(list) {
      if (!Array.isArray(list)) return;
      this.list = list;
      const key = this.cacheKey();
      if (key) try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
      this.emit();
    },
    async refresh() {
      if (!DR.Backend.isOnline()) {
        const key = this.cacheKey();
        if (key) try { const v = JSON.parse(localStorage.getItem(key) || "[]"); if (Array.isArray(v)) this.list = v; } catch {}
        this.emit();
        return this.list;
      }
      this.loading = true;
      this.emit();
      try {
        const r = await DR.MissionRepository.bestiary();
        this.set(r.bestiary);
        return r;
      } finally {
        this.loading = false;
        this.emit();
      }
    },
    async claim(key) {
      const r = await DR.MissionRepository.claimBestiary(key);
      this.set(r.bestiary);
      return r;
    },
  };

  DR.MissionDefinitions = MissionDefinitions;
  DR.MissionCategories = CATEGORIES;
  DR.Bestiary = Bestiary;
  DR.MissionRarities = RARITIES;
  DR.describeMission = describe;
  DR.MissionManager = MissionManager;
})();
