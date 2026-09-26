// LobbyUI — PLAY (solo/multiplayer), MULTIPLAYER (quick play / create / join code) and LOBBY.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => DR.escapeHtml(s);
  const DIFF = { easy: "Fácil", medium: "Médio", hard: "Difícil", nightmare: "Pesadelo" };
  const MODES = { classic: "Clássico", infinite: "Infinito", timed: "Contra o tempo" };

  const LobbyUI = {
    game: null,
    init(game) {
      this.game = game;
      $("solo").onclick = () => this.game.startSolo();
      $("multiplayer").onclick = () => this.openMultiplayer();
      $("quickplay").onclick = () => this.act(() => DR.LobbyManager.quickPlay(), "Procurando partida…");
      $("createlobby").onclick = () => this.act(() => DR.LobbyManager.create({ map: 0, difficulty: "medium", mode: "classic", isPublic: $("lobby-public").checked }), "Criando lobby…");
      $("join-form").onsubmit = (e) => {
        e.preventDefault();
        this.act(() => DR.LobbyManager.join($("join-code").value), "Entrando…");
      };
      $("join-code").addEventListener("input", (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)));
      $("lobby-ready").onclick = () => this.toggleReady();
      $("lobby-start").onclick = () => this.start();
      $("lobby-leave").onclick = () => this.leave();
      $("lobby-code").onclick = () => this.copyCode();
      for (const id of ["lobby-map", "lobby-difficulty", "lobby-mode"]) $(id).onchange = () => this.updateOptions();
      $("lobby-map").innerHTML = this.game.maps().map((m, i) => `<option value="${i}">${esc(m.name)}</option>`).join("");
      DR.LobbyManager.on((type, data) => this.onLobby(type, data));
    },
    openPlay() {
      this.game.screen("playscreen");
      const mpOk = DR.LobbyManager.local || (this.game.signedIn() && DR.Backend.isOnline());
      $("multiplayer").classList.toggle("locked", !mpOk);
      $("multiplayer").querySelector("small").textContent = DR.LobbyManager.local
        ? "Rede local (teste) · 1–4 jogadores"
        : !this.game.signedIn()
        ? "Requer conta · entre para jogar online"
        : DR.Backend.isOnline()
          ? "1–4 jogadores · online"
          : "OFFLINE · indisponível sem internet";
    },
    openMultiplayer() {
      if (!this.game.signedIn() && !DR.LobbyManager.local) {
        this.game.openLogin("Entre na sua conta para jogar online.");
        return;
      }
      if (!DR.Backend.isOnline() && !DR.LobbyManager.local) {
        this.game.error("OFFLINE", "O multiplayer precisa de conexão com a internet. O modo SOLO continua disponível.");
        return;
      }
      if (DR.LobbyManager.lobby) return this.openLobby();
      this.game.screen("mpscreen");
      $("mp-msg").textContent = "";
    },
    async act(fn, label) {
      const box = $("mpscreen");
      box.classList.add("busy");
      $("mp-msg").dataset.tone = "info";
      $("mp-msg").textContent = label;
      try {
        const lobby = await fn();
        if (lobby) {
          if (lobby.quickPlay === "created") this.game.toast("Nenhum lobby público livre: criamos um para você.");
          this.openLobby();
        }
      } catch (e) {
        $("mp-msg").dataset.tone = "error";
        $("mp-msg").textContent = e.message;
      } finally {
        box.classList.remove("busy");
      }
    },
    openLobby() {
      this.game.screen("lobbyscreen");
      this.render();
    },
    me() {
      return DR.LobbyManager.lobby?.players.find((p) => p.userId === DR.LobbyManager.me?.id);
    },
    render() {
      const L = DR.LobbyManager,
        l = L.lobby;
      if (!l) return;
      const host = L.isHost();
      $("lobby-code").textContent = l.code;
      $("lobby-visibility").textContent = l.isPublic ? "PÚBLICO · Quick Play" : "PRIVADO · entre pelo código";
      const slots = [];
      for (let i = 0; i < 4; i++) {
        const p = l.players[i];
        if (!p) {
          slots.push(`<li class="lp-slot empty"><span class="slot-name">Aguardando sobrevivente…</span></li>`);
          continue;
        }
        const online = p.userId === L.me.id || L.connected(p.userId);
        const ping = L.pings.get(p.userId);
        const ready = p.host || p.ready;
        slots.push(`<li class="lp-slot ${ready ? "ready" : ""} ${online ? "" : "offline"}">
          <span class="slot-avatar">${esc(p.username.slice(0, 2).toUpperCase())}</span>
          <span class="slot-name">${esc(p.username)}${p.host ? ' <em class="host-tag">HOST</em>' : ""}${p.userId === L.me.id ? ' <em class="you-tag">VOCÊ</em>' : ""}</span>
          <span class="slot-ping">${!online ? "SEM SINAL" : ping != null ? ping + " ms" : p.userId === L.me.id ? "" : "…"}</span>
          <span class="slot-state">${p.host ? "HOST" : p.ready ? "READY" : "NOT READY"}</span>
          ${host && !p.host ? `<button class="slot-kick" data-kick="${p.userId}" title="Remover">✕</button>` : ""}
        </li>`);
      }
      $("lobby-players").innerHTML = slots.join("");
      $("lobby-players").querySelectorAll("[data-kick]").forEach((b) => (b.onclick = () => this.kick(b.dataset.kick)));
      $("lobby-map").value = String(l.map);
      $("lobby-difficulty").value = l.difficulty;
      $("lobby-mode").value = l.mode;
      for (const id of ["lobby-map", "lobby-difficulty", "lobby-mode"]) $(id).disabled = !host || l.status !== "open";
      $("lobby-summary").textContent = `${this.game.maps()[l.map]?.name || "?"} · ${DIFF[l.difficulty] || l.difficulty} · ${MODES[l.mode] || l.mode}`;
      const me = this.me();
      const others = l.players.filter((p) => !p.host);
      const allReady = others.every((p) => p.ready);
      $("lobby-ready").classList.toggle("hidden", host);
      $("lobby-ready").textContent = me?.ready ? "CANCELAR READY" : "READY";
      $("lobby-ready").classList.toggle("is-ready", !!me?.ready);
      $("lobby-start").classList.toggle("hidden", !host);
      $("lobby-start").disabled = !allReady || l.status !== "open";
      $("lobby-hint").textContent = host
        ? allReady
          ? l.players.length > 1
            ? "Todos prontos. Inicie a partida."
            : "Você pode iniciar sozinho ou esperar amigos com o código."
          : `Aguardando ${others.filter((p) => !p.ready).length} jogador(es) ficar(em) READY.`
        : me?.ready
          ? "Pronto! Aguardando o host iniciar."
          : "Marque READY quando estiver pronto.";
    },
    async toggleReady() {
      const me = this.me();
      try {
        await DR.LobbyManager.setReady(!me?.ready);
      } catch (e) {
        this.game.toast(e.message);
      }
    },
    async updateOptions() {
      try {
        await DR.LobbyManager.update({ map: Number($("lobby-map").value), difficulty: $("lobby-difficulty").value, mode: $("lobby-mode").value });
      } catch (e) {
        this.game.toast(e.message);
        this.render();
      }
    },
    async start() {
      $("lobby-start").disabled = true;
      try {
        await DR.LobbyManager.start();
      } catch (e) {
        this.game.toast(e.message);
        this.render();
      }
    },
    async kick(userId) {
      try {
        await DR.LobbyManager.kick(userId);
      } catch (e) {
        this.game.toast(e.message);
      }
    },
    async leave() {
      await DR.LobbyManager.leave();
      this.openMultiplayer();
    },
    copyCode() {
      const code = DR.LobbyManager.lobby?.code;
      if (!code) return;
      navigator.clipboard?.writeText(code).then(
        () => this.game.toast(`Código ${code} copiado.`),
        () => this.game.toast(`Código: ${code}`),
      );
    },
    onLobby(type, data) {
      const inLobbyScreen = !$("lobbyscreen").classList.contains("hidden");
      if (type === "update" && inLobbyScreen) this.render();
      else if (type === "player-joined") this.game.feedEvent(`PLAYER JOINED · ${data.username}`);
      else if (type === "player-left") this.game.feedEvent(`PLAYER LEFT · ${data.username}`);
      else if (type === "host-changed" && inLobbyScreen) this.game.toast(`Novo host: ${DR.LobbyManager.name(data.hostId)}`);
      else if (type === "kicked") {
        this.game.error("REMOVIDO DO LOBBY", "O host removeu você deste lobby.");
        if (!this.game.inMatch()) this.openMultiplayer();
      } else if (type === "start") this.game.startMatch(data);
      else if (type === "finished" && !this.game.inMatch()) this.openLobby();
      else if (type === "connection" && inLobbyScreen) $("lobby-conn").textContent = data === "online" ? "● CONECTADO" : "● RECONECTANDO…";
    },
  };

  DR.LobbyUI = LobbyUI;
})();
