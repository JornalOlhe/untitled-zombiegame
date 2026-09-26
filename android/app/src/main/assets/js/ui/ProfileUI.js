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
    },
    open() {
      this.game.screen("profilescreen");
      this.render();
    },
    render() {
      const p = this.game.profile();
      const signed = this.game.signedIn();
      const guest = !signed;
      $("profilescreen").classList.toggle("guest", guest);
      const name = signed ? p?.displayName || p?.username || "Sobrevivente" : "Visitante";
      const level = p?.level || this.game.localLevel?.() || 1,
        xp = p?.xp || 0,
        need = p?.xpNeeded || 310;
      $("profile-name").textContent = name;
      $("profile-handle").textContent = signed ? `@${p?.username || ""} · ${DR.AuthService.user()?.email || ""}` : "Progresso salvo apenas neste aparelho";
      $("profile-level").textContent = `LVL ${level}`;
      $("profile-xp").textContent = `${n(xp)} / ${n(need)} XP`;
      $("profile-xpbar").style.width = `${Math.min(100, (100 * xp) / Math.max(1, need))}%`;
      const eco = this.game.economy();
      $("profile-coins").textContent = `◈ ${n(eco.coins)}`;
      $("profile-tickets").textContent = `↻ ${n(eco.normal)} · ✦ ${n(eco.lucky)}`;
      const s = p?.stats || {};
      const stats = [
        ["Eliminações", n(s.kills)],
        ["Maior onda", n(s.highestWave)],
        ["Chefes mortos", n((s.bossesKilled || 0) + (s.minibossesKilled || 0))],
        ["Partidas", n(s.gamesPlayed)],
        ["Headshots", n(s.headshots)],
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
        : `<p class="home-hint">Crie uma conta para salvar estatísticas, missões e cross-progression entre PC e Android.</p>`;
      $("profile-sync").textContent = signed ? (DR.Backend.isOnline() ? "● Sincronizado na nuvem" : "● OFFLINE · sincroniza ao reconectar") : "● Perfil local";
      $("profile-sync").dataset.state = signed ? (DR.Backend.isOnline() ? "online" : "offline") : "local";
      $("rename-input").value = p?.username || "";
      this.chip();
    },
    chip() {
      const p = this.game.profile(),
        signed = this.game.signedIn(),
        eco = this.game.economy();
      const name = signed ? p?.displayName || p?.username : "Visitante";
      const level = p?.level || 1,
        pct = Math.min(100, (100 * (p?.xp || 0)) / Math.max(1, p?.xpNeeded || 310));
      $("profilechip").innerHTML = `<span class="chip-avatar">${esc((name || "?").slice(0, 2).toUpperCase())}</span>
        <span class="chip-body"><b>${esc(name)}</b><small>${signed ? `LVL ${level}` : "Toque para entrar"}</small><i class="chip-xp"><em style="width:${signed ? pct : 0}%"></em></i></span>
        <span class="chip-wallet"><b>◈ ${n(eco.coins)}</b><small>↻ ${n(eco.normal)} · ✦ ${n(eco.lucky)}</small></span>`;
      $("accountbtn").querySelector("small").textContent = signed ? `@${p?.username || ""} · LVL ${level}` : "Entrar ou criar conta";
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
