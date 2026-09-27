// BadgeUI — badges (10 tiers: wood → jewel), player search, public profiles and the small
// "Achievement Unlocked" toast shown at the bottom of the screen (also during matches).
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => DR.escapeHtml(String(s ?? ""));
  const n = (v) => Number(v || 0).toLocaleString("pt-BR");
  const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  // Tier materials: base colour, highlight, glow.
  const TIERS = [
    null,
    { name: "Madeira", a: "#6b4a2b", b: "#a57a4c", glow: "transparent" },
    { name: "Pedra", a: "#5b6168", b: "#9aa1a8", glow: "transparent" },
    { name: "Bronze", a: "#7a4a22", b: "#d08a4a", glow: "#d08a4a33" },
    { name: "Prata", a: "#7e8894", b: "#e6ecf2", glow: "#e6ecf244" },
    { name: "Ouro", a: "#9a6c12", b: "#ffd35a", glow: "#ffd35a55" },
    { name: "Platina", a: "#5f8a8e", b: "#d9fbff", glow: "#bff6ff66" },
    { name: "Diamante", a: "#1e6fb0", b: "#8fe3ff", glow: "#6fd2ff77" },
    { name: "Cristal", a: "#6a3bb4", b: "#e2c6ff", glow: "#c79bff88" },
    { name: "Prismático", a: "#c0307a", b: "#6ff0ff", glow: "#ff8fe699", prism: true },
    { name: "Joia", a: "#8a0f3a", b: "#ffe45a", glow: "#ff5aa0aa", prism: true, jewel: true },
  ];
  const ICONS = { Tempo: "◷", Combate: "☠", Sobrevivência: "≋", Chefes: "♛", Multiplayer: "⚑", Spins: "✦", Dinheiro: "◈", Armas: "⌖", Mapas: "⌂", Classes: "⚔" };

  function medal(b, size = "") {
    const t = TIERS[b.tier] || null;
    const style = t ? `--ba:${t.a};--bb:${t.b};--bg:${t.glow}` : "--ba:#23292f;--bb:#39424a;--bg:transparent";
    return `<span class="badge-medal ${size} ${t ? "" : "locked"} ${t?.prism ? "prism" : ""} ${t?.jewel ? "jewel" : ""}" style="${style}"><i>${ICONS[b.category] || "★"}</i><em>${roman[b.tier] || ""}</em></span>`;
  }
  function card(b, { own = true } = {}) {
    const t = TIERS[b.tier],
      next = b.tier < 10 ? b.thresholds[b.tier] : null,
      prev = b.tier > 0 ? b.thresholds[b.tier - 1] : 0,
      pct = next ? Math.min(100, (100 * (b.value - prev)) / Math.max(1, next - prev)) : 100,
      date = b.tier ? b.earned?.[String(b.tier)] : null;
    return `<article class="badge-card ${b.tier ? "" : "locked"}" title="${esc(b.desc)}">
      ${medal(b)}
      <div class="badge-body">
        <b>${esc(b.name)}${b.tier ? ` <span class="badge-tier">${roman[b.tier]} · ${t.name}</span>` : ""}</b>
        <small>${esc(b.desc)}</small>
        ${own || b.tier ? `<i class="badge-bar"><em style="width:${pct}%"></em></i>
        <span class="badge-req">${next ? `${n(b.value)} / ${n(next)} para o tier ${roman[b.tier + 1]}` : "TIER MÁXIMO"}${date ? ` · conquistado em ${new Date(date).toLocaleDateString("pt-BR")}` : ""}</span>` : ""}
      </div>
    </article>`;
  }

  const BadgeUI = {
    game: null,
    list: [],
    filter: "Todas",
    queue: [],
    showing: false,
    init(game) {
      this.game = game;
      const style = document.createElement("style");
      style.textContent = `
        .badge-section{grid-column:1/-1}
        .badge-filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
        .badge-filters button{font-size:10px;padding:5px 9px;border-radius:99px;border:1px solid #2b3642;background:#0e151c;color:#b9c6d2}
        .badge-filters button.active{border-color:#ffd35a;color:#ffd35a}
        .badge-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;max-height:360px;overflow:auto;padding-right:4px}
        .badge-card{display:grid;grid-template-columns:54px 1fr;gap:10px;align-items:center;padding:9px;border:1px solid #ffffff14;border-radius:10px;background:linear-gradient(160deg,#111a22,#0a1016)}
        .badge-card.locked{opacity:.55}
        .badge-body b{display:block;font-size:12px;color:#eef3f7}
        .badge-tier{font-size:9px;letter-spacing:.08em;color:#ffd35a}
        .badge-body small{display:block;font-size:9px;color:#8093a3;margin:2px 0 5px}
        .badge-bar{display:block;height:5px;border-radius:99px;background:#ffffff12;overflow:hidden}
        .badge-bar em{display:block;height:100%;background:linear-gradient(90deg,#ffb84a,#ffe45a)}
        .badge-req{display:block;margin-top:4px;font-size:8px;color:#9fb0bf}
        .badge-medal{position:relative;display:grid;place-items:center;width:48px;height:48px;clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);background:linear-gradient(145deg,var(--bb),var(--ba) 60%,color-mix(in srgb,var(--ba) 60%,#000));box-shadow:0 0 18px var(--bg);color:#fff;text-shadow:0 2px 2px #0008}
        .badge-medal i{font-style:normal;font-size:19px;line-height:1}
        .badge-medal em{position:absolute;bottom:5px;font-style:normal;font-size:8px;font-weight:900;letter-spacing:.05em}
        .badge-medal.locked{filter:grayscale(1) brightness(.6)}
        .badge-medal.prism{background:conic-gradient(from 0deg,#ff5a8a,#ffd35a,#6fff9a,#6fd2ff,#b86fff,#ff5a8a);animation:badge-spin 5s linear infinite}
        .badge-medal.jewel::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,#fff9 50%,transparent 65%);animation:badge-shine 2.2s ease-in-out infinite}
        .badge-medal.lg{width:64px;height:64px}
        .badge-medal.sm{width:30px;height:30px}.badge-medal.sm i{font-size:12px}.badge-medal.sm em{font-size:6px;bottom:3px}
        @keyframes badge-spin{to{filter:hue-rotate(360deg)}}
        @keyframes badge-shine{0%,60%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
        #badgetoast{position:fixed;left:50%;bottom:22px;z-index:120;display:flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border-radius:12px;border:1px solid #ffd35a55;background:linear-gradient(160deg,#141c24f0,#0a0f14f0);box-shadow:0 12px 30px #000a;transform:translate(-50%,140%);opacity:0;transition:transform .35s cubic-bezier(.2,1.4,.4,1),opacity .25s;pointer-events:none}
        #badgetoast.show{transform:translate(-50%,0);opacity:1}
        #badgetoast small{display:block;font-size:8px;letter-spacing:.22em;color:#ffd35a}
        #badgetoast b{display:block;font-size:13px;color:#fff}
        .profile-search{display:flex;gap:6px;margin-left:auto}
        .profile-search input{width:170px;padding:6px 9px;border-radius:8px;border:1px solid #2b3642;background:#0b1117;color:#e6eef4}
        #searchresults{position:absolute;right:16px;top:58px;z-index:30;width:min(360px,92vw);max-height:360px;overflow:auto;border:1px solid #2b3642;border-radius:10px;background:#0b1117f5;box-shadow:0 18px 40px #000b}
        #searchresults.hidden{display:none}
        #searchresults button{display:grid;grid-template-columns:34px 1fr auto;gap:8px;align-items:center;width:100%;padding:8px 10px;border:0;border-bottom:1px solid #ffffff0d;background:transparent;color:#e6eef4;text-align:left}
        #searchresults button:hover{background:#15202b}
        #searchresults .sr-av{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#253240;font-size:11px;font-weight:900}
        #searchresults small{display:block;font-size:9px;color:#8a9aa8}
        #publicprofile{position:fixed;inset:0;z-index:110;display:grid;place-items:center;background:#020508c0;backdrop-filter:blur(5px)}
        #publicprofile.hidden{display:none}
        #publicprofile .pp-card{width:min(860px,94vw);max-height:90vh;overflow:auto;padding:18px;border-radius:14px;border:1px solid #2b3642;background:linear-gradient(160deg,#101820,#090d12)}
        #publicprofile header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
        #publicprofile .pp-avatar{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#253240;font-size:18px;font-weight:900}
        #publicprofile header h2{margin:0;font-size:22px}
        #publicprofile header p{margin:2px 0 0;font-size:11px;color:#8a9aa8}
        #publicprofile header button{margin-left:auto}
        #publicprofile .pp-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin-bottom:12px}
        #publicprofile .pp-stats div{padding:8px;border-radius:8px;background:#0e151c;border:1px solid #ffffff10}
        #publicprofile .pp-stats strong{display:block;font-size:15px}
        #publicprofile .pp-stats span{font-size:9px;color:#8a9aa8}
        #publicprofile .pp-top{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}`;
      document.head.appendChild(style);
      const toast = document.createElement("div");
      toast.id = "badgetoast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
      const modal = document.createElement("section");
      modal.id = "publicprofile";
      modal.className = "hidden";
      modal.setAttribute("role", "dialog");
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal || e.target.closest("[data-pp-close]")) modal.classList.add("hidden");
      });
      // Profile screen: badges card + player search in the header.
      const grid = document.querySelector("#profilescreen .profile-grid");
      if (grid && !$("profile-badges")) {
        const sec = document.createElement("section");
        sec.className = "profile-card badge-section";
        sec.innerHTML = `<h3>BADGES</h3><div class="badge-filters" id="badge-filters"></div><div class="badge-grid" id="profile-badges"></div>`;
        grid.appendChild(sec);
        sec.addEventListener("click", (e) => {
          const f = e.target.closest("[data-badge-filter]");
          if (f) {
            this.filter = f.dataset.badgeFilter;
            this.renderOwn();
          }
        });
      }
      const head = document.querySelector("#profilescreen .panel-head");
      if (head && !$("player-search")) {
        const form = document.createElement("form");
        form.className = "profile-search";
        form.id = "player-search";
        form.innerHTML = `<input id="player-search-input" maxlength="20" placeholder="Buscar jogador…" autocomplete="off" aria-label="Buscar jogador" /><button type="submit">BUSCAR</button>`;
        head.appendChild(form);
        const results = document.createElement("div");
        results.id = "searchresults";
        results.className = "hidden";
        document.querySelector("#profilescreen").appendChild(results);
        form.onsubmit = (e) => {
          e.preventDefault();
          this.search($("player-search-input").value);
        };
        $("player-search-input").addEventListener("input", () => {
          clearTimeout(this.searchTimer);
          this.searchTimer = setTimeout(() => this.search($("player-search-input").value, true), 350);
        });
        results.addEventListener("click", (e) => {
          const b = e.target.closest("[data-user]");
          if (b) {
            results.classList.add("hidden");
            this.openPublic(b.dataset.user);
          }
        });
      }
    },
    async refresh() {
      if (!this.game.signedIn() || !DR.Backend.isOnline()) return this.renderOwn();
      try {
        const r = await DR.Backend.rpc("badges_list", {});
        this.list = r.badges || [];
      } catch {}
      this.renderOwn();
    },
    renderOwn() {
      const box = $("profile-badges");
      if (!box) return;
      if (!this.game.signedIn()) {
        box.innerHTML = `<p class="home-hint">Entre com uma conta para ganhar badges.</p>`;
        $("badge-filters").innerHTML = "";
        return;
      }
      const cats = ["Todas", "Conquistadas", ...new Set(this.list.map((b) => b.category))];
      $("badge-filters").innerHTML = cats.map((c) => `<button type="button" data-badge-filter="${esc(c)}" class="${c === this.filter ? "active" : ""}">${esc(c)}</button>`).join("");
      const list = this.list.filter((b) => this.filter === "Todas" || (this.filter === "Conquistadas" ? b.tier > 0 : b.category === this.filter));
      box.innerHTML = list.length ? list.sort((a, b) => b.tier - a.tier).map((b) => card(b)).join("") : `<p class="home-hint">${this.list.length ? "Nenhuma badge nesta categoria ainda." : "Carregando badges…"}</p>`;
    },
    async search(q, quiet = false) {
      const results = $("searchresults");
      q = String(q || "").trim();
      if (q.length < 2) {
        results.classList.add("hidden");
        return;
      }
      if (!DR.Backend.isOnline()) return quiet || this.game.toast("Conecte-se para buscar jogadores.");
      try {
        const r = await DR.Backend.rpc("profile_search", { p_query: q });
        const list = r.results || [];
        results.innerHTML = list.length
          ? list.map((p) => `<button type="button" data-user="${esc(p.userId)}"><span class="sr-av">${esc((p.displayName || p.username || "?").slice(0, 2).toUpperCase())}</span><span><b>${esc(p.displayName || p.username)}</b><small>@${esc(p.username)} · LVL ${n(p.level)} · onda ${n(p.highestWave)}</small></span><small>${n(p.badges)} badges</small></button>`).join("")
          : `<p style="padding:12px;font-size:11px;color:#8a9aa8">Nenhum jogador encontrado.</p>`;
        results.classList.remove("hidden");
      } catch (e) {
        if (!quiet) this.game.toast(e.message);
      }
    },
    async openPublic(userId) {
      const modal = $("publicprofile");
      modal.innerHTML = `<div class="pp-card"><p>Carregando perfil…</p></div>`;
      modal.classList.remove("hidden");
      try {
        const p = await DR.Backend.rpc("profile_public", { p_user: userId });
        const s = p.stats || {},
          name = p.displayName || p.username,
          badges = p.badges || [],
          earned = badges.filter((b) => b.tier > 0).sort((a, b) => b.tier - a.tier);
        const stats = [["Eliminações", n(s.kills)], ["Maior onda", n(s.highestWave)], ["Headshots", n(s.headshots)], ["Chefes", n(s.bossesKilled)], ["Mini-bosses", n(s.minibossesKilled)], ["Partidas", n(s.gamesPlayed)], ["Vitórias", n(s.wins)], ["Tempo jogado", `${Math.floor((s.totalPlaytime || 0) / 3600)}h`], ["Dano", n(s.damageDealt)], ["Multiplayer", n(s.multiplayerMatches)]];
        modal.innerHTML = `<div class="pp-card">
          <header><span class="pp-avatar">${esc((name || "?").slice(0, 2).toUpperCase())}</span><div><h2>${esc(name)}</h2><p>@${esc(p.username)} · LVL ${n(p.level)} · ${earned.length} badges · desde ${new Date(p.createdAt).toLocaleDateString("pt-BR")}</p></div><button type="button" data-pp-close>FECHAR ✕</button></header>
          <div class="pp-top">${earned.slice(0, 8).map((b) => medal(b, "lg")).join("")}</div>
          <div class="pp-stats">${stats.map(([k, v]) => `<div><strong>${esc(v)}</strong><span>${esc(k)}</span></div>`).join("")}</div>
          <h3 style="font-size:12px;letter-spacing:.2em;color:#8aa4c0">BADGES</h3>
          <div class="badge-grid">${earned.length ? earned.map((b) => card(b, { own: false })).join("") : `<p class="home-hint">Nenhuma badge conquistada ainda.</p>`}</div>
        </div>`;
      } catch (e) {
        modal.innerHTML = `<div class="pp-card"><p>Não foi possível abrir o perfil: ${esc(e.message)}</p><button type="button" data-pp-close>FECHAR</button></div>`;
      }
    },
    // New tiers arrive in the profile JSON (badgesNew); show each once, then acknowledge.
    announce(profile) {
      const fresh = Array.isArray(profile?.badgesNew) ? profile.badgesNew : [];
      if (!fresh.length) return;
      const key = (b) => `${b.key}:${b.tier}`;
      this.seen ||= new Set();
      let added = false;
      for (const b of fresh) {
        if (this.seen.has(key(b))) continue;
        this.seen.add(key(b));
        this.queue.push(b);
        added = true;
      }
      if (added) {
        DR.Backend.rpc("badges_ack", {}).catch(() => {});
        this.next();
      }
    },
    next() {
      if (this.showing || !this.queue.length) return;
      this.showing = true;
      const b = this.queue.shift(),
        info = this.list.find((x) => x.key === b.key) || { category: "", ...b },
        t = document.getElementById("badgetoast");
      t.innerHTML = `${medal({ ...info, tier: b.tier }, "sm")}<span><small>ACHIEVEMENT UNLOCKED</small><b>${esc(b.name)} ${roman[b.tier]}</b></span>`;
      t.classList.add("show");
      this.game.sound?.(b.tier);
      setTimeout(() => {
        t.classList.remove("show");
        setTimeout(() => {
          this.showing = false;
          this.next();
        }, 400);
      }, 2800);
    },
  };

  DR.BadgeUI = BadgeUI;
})();
