// SettingsUI — tabbed settings (Gráficos, Áudio, Câmera, Controles) over SettingsManager.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => DR.escapeHtml(String(s));

  // Slider fill from the real value: progress = (value - min) / (max - min). MIN is exactly
  // empty and MAX exactly full for every range (volume 0..100, FOV 60..120, resolution
  // 0.5..1.5…). In between the fill edge follows the thumb centre.
  function rangeProgress(el) {
    const min = Number(el.min || 0),
      max = Number(el.max || 100),
      v = Number(el.value);
    if (!(max > min) || !Number.isFinite(v)) return 0;
    return Math.min(1, Math.max(0, (v - min) / (max - min)));
  }
  function paintRange(el) {
    const p = rangeProgress(el);
    el.style.setProperty("--range-progress", String(p));
    el.style.setProperty("--range-fill", p <= 0 ? "0%" : p >= 1 ? "100%" : `calc(9px + (100% - 18px) * ${p})`);
  }
  DR.paintRange = paintRange;
  DR.rangeProgress = rangeProgress;
  const TABS = [
    ["graphics", "Gráficos"],
    ["audio", "Áudio"],
    ["camera", "Câmera"],
    ["controls", "Controles"],
  ];
  const pct = (v) => `${Math.round(v * 100)}%`;

  const SettingsUI = {
    hooks: null,
    tab: "graphics",
    capturing: null,
    boundAt: 0,
    init(hooks) {
      this.hooks = hooks;
      $("settingsscreen").querySelectorAll("[data-settings-tab]").forEach((b) => {
        b.onclick = () => {
          this.tab = b.dataset.settingsTab;
          this.render();
        };
      });
      $("resetsettings").onclick = () => this.reset();
      $("settingsfields").addEventListener("click", (e) => {
        const b = e.target.closest("[data-bind]");
        if (b && performance.now() - this.boundAt > 400) this.capture(b.dataset.bind);
      });
      $("settingsfields").addEventListener("contextmenu", (e) => e.preventDefault());
      window.addEventListener("keydown", (e) => this.onCaptureKey(e), true);
      window.addEventListener("mousedown", (e) => this.onCaptureMouse(e), true);
    },
    get s() {
      return DR.Settings.data;
    },
    open() {
      this.cancelCapture();
      this.message("");
      this.render();
    },
    message(text, tone = "info") {
      const m = $("settings-msg");
      m.textContent = text;
      m.dataset.tone = tone;
    },
    select(k, label, opts, hint = "") {
      return `<label class="set-row"><span class="set-name">${label}${hint ? `<small>${hint}</small>` : ""}</span><select data-setting="${k}">${opts
        .map(([v, l]) => `<option value="${v}" ${this.s[k] === v ? "selected" : ""}>${l}</option>`)
        .join("")}</select></label>`;
    },
    range(k, label, min, max, step, fmt = (v) => v, hint = "") {
      return `<label class="set-row"><span class="set-name">${label}${hint ? `<small>${hint}</small>` : ""}</span><span class="set-range"><input data-setting="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${this.s[k]}" /><output data-out="${k}">${fmt(this.s[k])}</output></span></label>`;
    },
    check(k, label, hint = "") {
      return `<label class="set-row set-check"><span class="set-name">${label}${hint ? `<small>${hint}</small>` : ""}</span><input type="checkbox" data-setting="${k}" ${this.s[k] ? "checked" : ""} /></label>`;
    },
    formats: {
      resolution: pct,
      drawDistance: pct,
      adsSensitivity: pct,
      sensitivity: (v) => Number(v).toFixed(1),
      fov: (v) => `${v}°`,
    },
    fmt(k) {
      return this.formats[k] || ((v) => `${v}%`);
    },
    render() {
      document.querySelectorAll("[data-settings-tab]").forEach((b) => {
        const on = b.dataset.settingsTab === this.tab;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
      });
      const body = $("settingsfields");
      body.dataset.tab = this.tab;
      body.innerHTML = this[this.tab]();
      body.scrollTop = 0;
      body.querySelectorAll("[data-setting]").forEach((el) => (el.oninput = () => this.change(el)));
      body.querySelectorAll('input[type="range"]').forEach(paintRange);
      const fs = body.querySelector("[data-fullscreen]");
      if (fs) fs.onchange = () => this.hooks.fullscreen(fs.checked).finally(() => (fs.checked = !!document.fullscreenElement));
    },
    graphics() {
      const canFullscreen = !window.DeadRecoilRuntime?.native && !!document.documentElement.requestFullscreen;
      return `<div class="set-group"><h3>Qualidade</h3>
        ${this.select("graphics", "Predefinição", [["low", "Baixo"], ["medium", "Médio"], ["high", "Alto"], ["ultra", "Ultra"]], "Ajusta sombras, partículas e distância juntos")}
        ${this.select("shadows", "Sombras", [["off", "Desligadas"], ["low", "Baixo"], ["medium", "Médio"], ["high", "Alto"]])}
        ${this.select("vfx", "Partículas e efeitos", [["off", "Desligados"], ["low", "Baixo"], ["high", "Alto"]])}
      </div><div class="set-group"><h3>Tela</h3>
        ${this.range("resolution", "Escala de resolução", 0.5, 1.5, 0.05, pct, "Abaixo de 100% ganha desempenho")}
        ${this.range("drawDistance", "Distância de visão", 0.6, 1.4, 0.05, pct)}
        ${canFullscreen ? `<label class="set-row set-check"><span class="set-name">Tela cheia</span><input type="checkbox" data-fullscreen ${document.fullscreenElement ? "checked" : ""} /></label>` : ""}
        ${this.check("fps", "Mostrar FPS")}
        ${this.check("numbers", "Números de dano")}
      </div>`;
    },
    audio() {
      return `<div class="set-group"><h3>Volume</h3>
        ${this.range("master", "Geral", 0, 100, 1)}
        ${this.range("music", "Música", 0, 100, 1)}
        ${this.range("ambient", "Ambiente", 0, 100, 1, undefined, "Clima e sons do mapa")}
        ${this.range("weapons", "Armas", 0, 100, 1, undefined, "Tiros, recarga e golpes")}
        ${this.range("sfx", "Efeitos", 0, 100, 1, undefined, "Monstros, explosões e impactos")}
        ${this.range("ui", "Interface", 0, 100, 1, undefined, "Menus, spins e recompensas")}
      </div>`;
    },
    camera() {
      return `<div class="set-group"><h3>Mira e visão</h3>
        ${this.range("sensitivity", "Sensibilidade", 0.1, 5, 0.1, this.formats.sensitivity)}
        ${this.range("adsSensitivity", "Sensibilidade ao mirar", 0.1, 2, 0.05, pct, "Multiplica a sensibilidade durante a mira")}
        ${this.range("fov", "Campo de visão (FOV)", 60, 120, 1, this.formats.fov)}
        ${this.check("invert", "Inverter eixo Y")}
      </div>`;
    },
    controls() {
      const K = DR.Keybinds;
      const groups = {};
      for (const a of K.actions) (groups[a.group] ||= []).push(a);
      const touchOnly = matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;
      return (
        (touchOnly ? `<p class="set-note">No celular os controles são por toque. As teclas abaixo valem para teclado e mouse.</p>` : "") +
        Object.entries(groups)
          .map(
            ([g, list]) =>
              `<div class="set-group set-keys"><h3>${esc(g)}</h3>${list
                .map(
                  (a) =>
                    `<div class="set-row key-row"><span class="set-name">${esc(a.label)}</span><button type="button" class="key-btn ${this.capturing === a.id ? "listening" : ""}" data-bind="${a.id}" ${a.locked ? 'disabled title="Fixo"' : ""}>${this.capturing === a.id ? "Pressione…" : esc(K.label(K.code(a.id)))}</button></div>`,
                )
                .join("")}</div>`,
          )
          .join("")
      );
    },
    change(el) {
      const s = this.s,
        k = el.dataset.setting;
      s[k] = el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value;
      const out = $("settingsfields").querySelector(`[data-out="${k}"]`);
      if (out) out.textContent = this.fmt(k)(s[k]);
      if (el.type === "range") paintRange(el);
      if (k === "graphics") {
        s.shadows = { low: "off", medium: "low", high: "medium", ultra: "high" }[s.graphics];
        s.vfx = s.graphics === "low" ? "low" : "high";
      }
      DR.Settings.save();
      if (["graphics", "shadows", "vfx", "resolution", "drawDistance"].includes(k)) {
        this.hooks.apply();
        if (k === "graphics") this.render();
      } else {
        DR.Audio.volumes();
        $("fps").classList.toggle("hidden", !s.fps);
        this.hooks.camera?.();
      }
    },
    reset() {
      const d = DR.Settings.defaults,
        s = this.s;
      const keysOf = {
        graphics: ["graphics", "shadows", "vfx", "resolution", "drawDistance", "fps", "numbers"],
        audio: ["master", "music", "ambient", "weapons", "sfx", "ui"],
        camera: ["sensitivity", "adsSensitivity", "fov", "invert"],
      };
      if (this.tab === "controls") DR.Keybinds.reset();
      else for (const k of keysOf[this.tab]) s[k] = d[k];
      DR.Settings.save();
      this.hooks.apply();
      this.render();
      this.message(`Padrões de ${TABS.find((t) => t[0] === this.tab)[1]} restaurados.`, "ok");
    },
    capture(id) {
      if (this.capturing === id) return this.cancelCapture();
      this.capturing = id;
      this.message("Pressione a nova tecla ou botão do mouse · Esc cancela", "info");
      this.render();
    },
    cancelCapture() {
      if (!this.capturing) return;
      this.capturing = null;
      this.message("");
      if (!$("settingsscreen").classList.contains("hidden")) this.render();
    },
    bind(code) {
      const id = this.capturing;
      this.capturing = null;
      this.boundAt = performance.now();
      const K = DR.Keybinds,
        r = K.set(id, code);
      DR.Settings.save();
      this.render();
      const a = K.actions.find((x) => x.id === id);
      if (!r.ok) this.message(r.reason, "warn");
      else if (r.swapped) this.message(`${K.label(code)} estava em "${r.swapped.label}". As teclas foram trocadas: "${r.swapped.label}" agora usa ${K.label(r.prev)}.`, "warn");
      else this.message(`"${a.label}" agora usa ${K.label(code)}.`, "ok");
    },
    onCaptureKey(e) {
      if (!this.capturing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === "Escape") return this.cancelCapture();
      if (e.code) this.bind(e.code);
    },
    onCaptureMouse(e) {
      if (!this.capturing) return;
      if (!e.target.closest?.(`[data-bind="${this.capturing}"]`)) return this.cancelCapture();
      e.preventDefault();
      e.stopImmediatePropagation();
      this.bind("Mouse" + e.button);
    },
    helpHtml() {
      const K = DR.Keybinds,
        k = (id) => `<kbd>${esc(K.label(K.code(id)))}</kbd>`;
      return [
        [`${k("forward")} ${k("left")} ${k("back")} ${k("right")}`, "Mover"],
        ["<kbd>Mouse</kbd>", "Olhar"],
        [k("fire"), "Atirar / atacar"],
        [k("aim"), "Mirar (ADS)"],
        [k("reload"), "Recarregar"],
        ["<kbd>Rodinha</kbd>", "1ª / 3ª pessoa"],
        [k("ability"), "Habilidade da classe"],
        [k("grenade"), "Granada"],
        [k("sprint"), "Correr"],
        [k("crouch"), "Agachar"],
        [k("jump"), "Pular"],
        [k("interact"), "Reanimar aliado"],
        [k("menu"), "Menu da partida"],
        [k("freeMouse"), "Liberar o mouse"],
        [k("missions"), "Missões"],
      ]
        .map(([key, label]) => `<span>${key} ${label}</span>`)
        .join("");
    },
  };

  DR.SettingsUI = SettingsUI;
})();
