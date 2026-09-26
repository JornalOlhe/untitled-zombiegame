// Keybinds — rebindable actions. Gameplay code keeps reading the default codes ("KeyW",
// "ShiftLeft"…); the input layer translates whatever physical key the player bound into them.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});

  const ACTIONS = [
    { id: "forward", label: "Andar para frente", def: "KeyW", group: "Movimento" },
    { id: "back", label: "Andar para trás", def: "KeyS", group: "Movimento" },
    { id: "left", label: "Andar para a esquerda", def: "KeyA", group: "Movimento" },
    { id: "right", label: "Andar para a direita", def: "KeyD", group: "Movimento" },
    { id: "sprint", label: "Correr", def: "ShiftLeft", group: "Movimento" },
    { id: "crouch", label: "Agachar", def: "ControlLeft", group: "Movimento" },
    { id: "jump", label: "Pular", def: "Space", group: "Movimento" },
    { id: "fire", label: "Atirar", def: "Mouse0", group: "Combate" },
    { id: "aim", label: "Mirar", def: "Mouse2", group: "Combate" },
    { id: "reload", label: "Recarregar", def: "KeyR", group: "Combate" },
    { id: "ability", label: "Habilidade da classe", def: "KeyQ", group: "Combate" },
    { id: "weaponAbility", label: "Habilidade da arma", def: "KeyF", group: "Combate" },
    { id: "grenade", label: "Granada", def: "KeyG", group: "Combate" },
    { id: "slot1", label: "Arma 1", def: "Digit1", group: "Combate" },
    { id: "slot2", label: "Arma 2", def: "Digit2", group: "Combate" },
    { id: "slot3", label: "Arma 3", def: "Digit3", group: "Combate" },
    { id: "slot4", label: "Arma 4", def: "Digit4", group: "Combate" },
    { id: "slot5", label: "Arma 5", def: "Digit5", group: "Combate" },
    { id: "interact", label: "Interagir / reanimar", def: "KeyE", group: "Combate" },
    { id: "menu", label: "Menu da partida", def: "Escape", group: "Interface", locked: true },
    { id: "freeMouse", label: "Liberar o mouse", def: "KeyJ", group: "Interface" },
    { id: "missions", label: "Missões", def: "KeyM", group: "Interface" },
  ];
  const byId = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
  const NAMES = {
    Mouse0: "Botão esquerdo", Mouse1: "Botão do meio", Mouse2: "Botão direito", Mouse3: "Mouse 4", Mouse4: "Mouse 5",
    Space: "Espaço", ShiftLeft: "Shift", ShiftRight: "Shift direito", ControlLeft: "Ctrl", ControlRight: "Ctrl direito",
    AltLeft: "Alt", AltRight: "Alt Gr", Tab: "Tab", CapsLock: "Caps Lock", Escape: "Esc", Enter: "Enter",
    Backspace: "Backspace", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Backquote: "`", Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\",
  };
  const RESERVED = new Set(["Escape", "F11", "F12", "MetaLeft", "MetaRight"]);

  const Keybinds = {
    actions: ACTIONS,
    map: {},
    reverse: new Map(),
    store: null,
    load(store) {
      this.store = store;
      this.map = {};
      for (const a of ACTIONS) {
        const v = store?.[a.id];
        this.map[a.id] = !a.locked && typeof v === "string" && v ? v : a.def;
      }
      this.index();
    },
    index() {
      this.reverse = new Map();
      for (const a of ACTIONS) this.reverse.set(this.map[a.id], a.id);
    },
    save() {
      if (!this.store) return;
      for (const k of Object.keys(this.store)) delete this.store[k];
      for (const a of ACTIONS) if (this.map[a.id] !== a.def) this.store[a.id] = this.map[a.id];
    },
    code(id) {
      return this.map[id] || byId[id]?.def;
    },
    action(code) {
      return this.reverse.get(code) || null;
    },
    // Physical code → the default code gameplay understands, or null if the key does nothing.
    canon(code) {
      const id = this.reverse.get(code);
      return id ? byId[id].def : null;
    },
    label(code) {
      if (!code) return "—";
      if (NAMES[code]) return NAMES[code];
      if (/^Key[A-Z]$/.test(code)) return code.slice(3);
      if (/^Digit\d$/.test(code)) return code.slice(5);
      if (/^Numpad/.test(code)) return "Num " + code.slice(6);
      return code;
    },
    // Binds and resolves a conflict by swapping with the action that had the key.
    set(id, code) {
      const a = byId[id];
      if (!a || a.locked) return { ok: false, reason: "Esta ação não pode ser alterada." };
      if (RESERVED.has(code)) return { ok: false, reason: `${this.label(code)} é reservada.` };
      const other = this.reverse.get(code);
      if (other === id) return { ok: true };
      if (other && byId[other].locked) return { ok: false, reason: `${this.label(code)} já abre o ${byId[other].label.toLowerCase()}.` };
      const prev = this.map[id];
      this.map[id] = code;
      if (other) this.map[other] = prev;
      this.index();
      this.save();
      return { ok: true, swapped: other ? byId[other] : null, prev };
    },
    reset() {
      for (const a of ACTIONS) this.map[a.id] = a.def;
      this.index();
      this.save();
    },
  };

  DR.Keybinds = Keybinds;
})();
