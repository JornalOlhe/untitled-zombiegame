// ProfileUI — the PROFILE screen (level, XP, coins, stats, username) and the home profile chip.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => DR.escapeHtml(s);
  const n = (v) => Number(v || 0).toLocaleString("pt-BR");
  const time = (s) => {
    s = Number(s || 0);
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}min` : `${m}min`;
  };

  const ProfileUI = {
    game: null,
    init(game) {
      this.game = game;
      $("profile-logout").onclick = () => this.game.logout();
      $("profile-login").onclick = () => this.game.openLogin();
      $("profile-rename").onsubmit = (e) => {
        e.preventDefault();
        this.rename();
      };
      $("profilechip").onclick = () => this.open();
      $("profile-progress").addEventListener("click", (e) => {
        const b = e.target.closest("[data-go]");
        if (b) b.dataset.go === "index" ? DR.MissionUI.openIndex() : DR.MissionUI.open();
      });
    },
    open() {
      this.game.screen("profilescreen");
      this.render();
      // Progress panels use the missions and Index data; fetch them if this session has none yet.
      DR.BadgeUI?.refresh();
      if (this.game.signedIn() && DR.Backend.isOnline()) {
        if (!DR.MissionManager.list.length) DR.MissionManager.refresh().then(() => this.render(), () => {});
        if (!DR.Bestiary.list.length) DR.Bestiary.refresh().then(() => this.render(), () => {});
      }
    },
    render() {
      const p = this.game.profile();
      const signed = this.game.signedIn(),
        dev = !!p?.devSandbox;
      $("profilescreen").classList.toggle("guest", !signed && !dev);
      const name = dev ? "DEV SANDBOX" : signed ? p?.displayName || p?.username || "Sobrevivente" : "Visitante";
      const level = dev ? 1 : p?.level || this.game.localLevel?.() || 1,
        xp = p?.xp || 0,
        need = p?.xpNeeded || 310;
      $("profile-avatar").textContent = (name || "?").slice(0, 2).toUpperCase();
      $("profile-name").textContent = name;
      $("profile-handle").textContent = dev ? "Perfil isolado · nada é salvo na sua conta real" : signed ? [`@${p?.username || ""}`, DR.AuthService.user()?.email].filter(Boolean).join(" · ") : "Progresso salvo apenas neste aparelho";
      $("profile-level").textContent = `LVL ${level}`;
      $("profile-xp").textContent = `${n(xp)} / ${n(need)} XP para o nível ${level + 1}`;
      $("profile-xpbar").style.width = `${Math.min(100, (100 * xp) / Math.max(1, need))}%`;
      const eco = this.game.economy();
      $("profile-coins").textContent = `◈ ${n(eco.coins)}`;
      $("profile-tickets").textContent = `↻ ${n(eco.normal)} normal · ✦ ${n(eco.lucky)} Lucky`;
      const load = this.game.loadout?.() || {};
      $("profile-loadout").innerHTML = `<span><small>CLASSE</small><b>${esc(load.cls || "—")}</b></span><span><small>ARMA</small><b>${esc(load.weapon || "—")}</b></span>`;
      const s = p?.stats || {};
      const stats = [
        ["Eliminações", n(s.kills)],
        ["Maior onda", n(s.highestWave)],
        ["Headshots", n(s.headshots)],
        ["Chefes", n(s.bossesKilled)],
        ["Mini-bosses", n(s.minibossesKilled)],
        ["Partidas", n(s.gamesPlayed)],
        ["Vitórias", n(s.wins)],
        ["Derrotas", n(s.losses)],
        ["Tempo jogado", time(s.totalPlaytime)],
        ["Dano causado", n(s.damageDealt)],
        ["Reanimações", n(s.revives)],
        ["Multiplayer", n(s.multiplayerMatches)],
        ["Moedas ganhas", n(s.coinsEarned)],
      ];
      $("profile-stats").innerHTML = signed
        ? stats.map(([k, v]) => `<div><strong>${esc(v)}</strong><span>${esc(k)}</span></div>`).join("")
        : `<p class="home-hint">Crie uma conta para salvar estatísticas, missões, o Índice e o progresso entre PC e Android.</p>`;
      $("profile-progress").innerHTML = signed ? this.progress() : "";
      $("profile-highlights").innerHTML = signed ? this.highlights(s) : "";
      $("profile-since").textContent = signed && p?.createdAt ? `Sobrevivente desde ${new Date(p.createdAt).toLocaleDateString("pt-BR")}` : "";
      $("profile-sync").textContent = dev ? "● DEV SANDBOX · SEM SINCRONIZAÇÃO" : signed ? (DR.Backend.isOnline() ? "● Sincronizado na nuvem" : "● OFFLINE · sincroniza ao reconectar") : "● Perfil local";
      $("profile-sync").dataset.state = dev ? "local" : signed ? (DR.Backend.isOnline() ? "online" : "offline") : "local";
      $("rename-input").value = p?.username || "";
      this.chip();
    },
    progress() {
      const MM = DR.MissionManager,
        B = DR.Bestiary;
      const row = (label, done, total, go, extra = "") =>
        `<button class="pp-row" type="button" data-go="${go}"><span>${label}</span><b>${total ? `${done} / ${total}` : "—"}</b><i><em style="width:${total ? (100 * done) / total : 0}%"></em></i>${extra ? `<small>${extra}</small>` : ""}</button>`;
      const cat = (c) => {
        const list = MM.of(c).filter((m) => !m.final);
        return [list.filter((m) => m.completed).length, list.length];
      };
      const uniq = MM.of("unique"),
        seen = B.list.filter((e) => e.kills > 0).length,
        ready = MM.claimable(),
        idxReady = B.claimable();
      return (
        row("Missões diárias", ...cat("daily"), "missions") +
        row("Missões semanais", ...cat("weekly"), "missions") +
        row("Conquistas únicas", uniq.filter((m) => m.claimed).length, uniq.length, "missions") +
        row("Espécies no Índice", seen, B.list.length, "index", idxReady ? `${idxReady} recompensa${idxReady > 1 ? "s" : ""} para resgatar` : "") +
        (ready ? `<p class="pp-ready">${ready} ${ready > 1 ? "missões prontas" : "missão pronta"} para resgatar</p>` : "")
      );
    },
    highlights(s) {
      const kills = Number(s.kills || 0),
        games = Number(s.gamesPlayed || 0),
        mins = Number(s.totalPlaytime || 0) / 60;
      const top = DR.Bestiary.list.filter((e) => !e.boss).sort((a, b) => b.kills - a.kills)[0];
      const items = [
        ["Precisão de headshot", kills ? `${Math.round((100 * (s.headshots || 0)) / kills)}%` : "—"],
        ["Eliminações por partida", games ? n(Math.round(kills / games)) : "—"],
        ["Eliminações por minuto", mins >= 1 ? (kills / mins).toFixed(1).replace(".", ",") : "—"],
        ["Taxa de vitória", s.wins || s.losses ? `${Math.round((100 * (s.wins || 0)) / ((s.wins || 0) + (s.losses || 0)))}%` : "—"],
        ["Inimigo mais abatido", top?.kills ? `${DR.Bestiary.info(top.key).name} · ${n(top.kills)}` : "—"],
      ];
      return items.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
    },
    chip() {
      const p = this.game.profile(),
        signed = this.game.signedIn(),
        dev = !!p?.devSandbox,
        eco = this.game.economy();
      const name = dev ? "DEV SANDBOX" : signed ? p?.displayName || p?.username : "Visitante";
      const level = dev ? 1 : p?.level || 1,
        pct = Math.min(100, (100 * (p?.xp || 0)) / Math.max(1, p?.xpNeeded || 310));
      $("profilechip").innerHTML = `<span class="chip-avatar">${esc((name || "?").slice(0, 2).toUpperCase())}</span>
        <span class="chip-body"><b>${esc(name)}</b><small>${dev ? "LVL 1 · ISOLADO" : signed ? `LVL ${level}` : "Toque para entrar"}</small><i class="chip-xp"><em style="width:${signed && !dev ? pct : 0}%"></em></i></span>
        <span class="chip-wallet"><b>◈ ${n(eco.coins)}</b><small>↻ ${n(eco.normal)} · ✦ ${n(eco.lucky)}</small></span>`;
      const accountBtn = $("accountbtn");
      if (accountBtn) accountBtn.querySelector("small").textContent = dev ? "DEV · CONTA REAL ISOLADA" : signed ? `@${p?.username || ""} · LVL ${level}` : "Entrar ou criar conta";
    },
    async rename() {
      const value = $("rename-input").value.trim();
      const b = $("profile-rename").querySelector("button");
      b.disabled = true;
      try {
        const r = await DR.ProfileRepository.setUsername(value);
        this.game.applyProfile(r.profile);
        this.game.toast("Nome atualizado.");
      } catch (e) {
        this.game.toast(e.message);
      } finally {
        b.disabled = false;
        this.render();
      }
    },
  };

  DR.ProfileUI = ProfileUI;
})();
