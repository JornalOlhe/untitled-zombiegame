// MissionUI — the MISSIONS page (daily / weekly / unique), the INDEX (bestiary) page, the in-match
// mission tracker and the MISSION COMPLETE / CLAIM flow.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => DR.escapeHtml(String(s ?? ""));
  const n = (v) => Number(v || 0).toLocaleString("pt-BR");

  function countdown(ms) {
    if (ms == null) return "—";
    const s = Math.floor(ms / 1000),
      d = Math.floor(s / 86400),
      h = Math.floor((s % 86400) / 3600),
      m = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${String(m).padStart(2, "0")}min`;
    return `${m}min ${String(s % 60).padStart(2, "0")}s`;
  }
  const rewardChips = (r) =>
    [
      r.coins || r.rewardCoins ? `<span class="rw-coin">◈ ${n(r.coins ?? r.rewardCoins)}</span>` : "",
      r.xp || r.rewardXp ? `<span class="rw-xp">${n(r.xp ?? r.rewardXp)} XP</span>` : "",
      r.normal || r.rewardNormal ? `<span class="rw-ticket">↻ ${n(r.normal ?? r.rewardNormal)}</span>` : "",
      r.lucky || r.rewardLucky ? `<span class="rw-lucky">✦ ${n(r.lucky ?? r.rewardLucky)}</span>` : "",
    ].join("");

  const MissionUI = {
    game: null,
    tab: "daily",
    from: null,
    claiming: new Set(),
    timer: 0,
    init(game) {
      this.game = game;
      DR.MissionManager.onChange((list, extra = {}) => {
        this.render();
        for (const m of extra.completed || []) this.game.missionToast(DR.describeMission(m));
      });
      DR.Bestiary.onChange(() => this.renderIndex());
      $("missionscreen").addEventListener("click", (e) => {
        const b = e.target.closest("[data-claim]");
        if (b) this.claim(Number(b.dataset.claim), b);
        const t = e.target.closest("[data-mission-tab]");
        if (t) {
          this.tab = t.dataset.missionTab;
          this.render();
        }
      });
      $("indexscreen").addEventListener("click", (e) => {
        const b = e.target.closest("[data-claim-enemy]");
        if (b) this.claimEnemy(b.dataset.claimEnemy, b);
      });
      $("missions-refresh").onclick = () => this.refresh();
      $("index-refresh").onclick = () => this.refreshIndex();
      if ($("missions-index")) $("missions-index").onclick = () => this.openIndex(this.from);
      $("mission-reward-ok").onclick = () => $("missionreward").classList.add("hidden");
      $("missiontracker").addEventListener("click", () => this.game.openGameMissions?.());
    },
    inMatch() {
      return this.from === "game" || this.from === "pause";
    },
    // Back from missions/Index opened during a match: return to the match or its menu.
    leave() {
      if (!this.inMatch()) return false;
      const from = this.from;
      this.from = null;
      clearInterval(this.timer);
      if (from === "game") this.game.resumeGame();
      else this.game.screen("pausescreen");
      return true;
    },
    async open({ from = null } = {}) {
      this.from = from;
      if (!from && this.game.animateTo) await this.game.animateTo("missionscreen");
      this.game.screen("missionscreen");
      $("missionscreen").classList.toggle("in-match", this.inMatch());
      this.render();
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        if ($("missionscreen").classList.contains("hidden")) return clearInterval(this.timer);
        this.renderTimers();
      }, 1000);
      await this.refresh();
    },
    async refresh() {
      if (!this.game.signedIn()) return this.render();
      try {
        await DR.MissionManager.refresh();
      } catch (e) {
        this.game.toast(e.message);
      }
    },
    card(raw) {
      const m = DR.describeMission(raw),
        state = m.claimed ? "claimed" : m.completed ? "done" : "open";
      const flag = m.claimed ? '<span class="mission-flag claimed">RESGATADA</span>' : m.completed ? '<span class="mission-flag">CONCLUÍDA</span>' : "";
      const action = m.claimed
        ? '<span class="claimed-note">✓ Recompensa recebida</span>'
        : m.completed
          ? `<button class="claim-btn" data-claim="${m.id}" type="button">RESGATAR</button>`
          : `<span class="mission-pct">${Math.floor(m.pct)}%</span>`;
      return `<article class="mission-card ${state} ${m.final ? "final" : ""}" style="--rarity:${m.color}">
        <header><span class="mission-icon">${m.icon}</span><span class="mission-rarity">${m.final ? "RECOMPENSA FINAL" : m.rarityName}</span>${flag}</header>
        <h3>${esc(m.title)}</h3>
        <div class="mission-progress"><i style="width:${m.claimed ? 100 : m.pct}%"></i></div>
        <div class="mission-meta"><b>${esc(m.progressText)}</b><span class="mission-rewards">${rewardChips(m)}</span></div>
        <footer class="mission-foot">${action}</footer>
      </article>`;
    },
    render() {
      const MM = DR.MissionManager,
        list = MM.list || [],
        signed = this.game.signedIn(),
        online = DR.Backend.isOnline();
      const body = $("mission-list"),
        summary = $("mission-summary");
      document.querySelectorAll("[data-mission-tab]").forEach((b) => {
        const cat = b.dataset.missionTab,
          ready = MM.of(cat).filter((m) => m.completed && !m.claimed).length;
        b.classList.toggle("active", cat === this.tab);
        b.setAttribute("aria-selected", String(cat === this.tab));
        b.querySelector("i").textContent = ready || "";
      });
      if (!signed) {
        summary.innerHTML = "";
        body.innerHTML = `<div class="empty-state"><h3>Missões exigem uma conta</h3><p>Entre para receber missões diárias, semanais e conquistas únicas, ganhar moedas e XP e manter o progresso no PC e no Android.</p><button class="primary" data-go-login type="button">ENTRAR / CRIAR CONTA</button></div>`;
        body.querySelector("[data-go-login]").onclick = () => this.game.openLogin();
      } else {
        let items = MM.of(this.tab);
        // Unique missions: 100 new every month that never expire — filter by month and status.
        let filterBar = "";
        if (this.tab === "unique") {
          const months = [...new Set(items.map((m) => m.month).filter(Boolean))].sort().reverse();
          const monthName = (k) => {
            const [y, mo] = k.split("-").map(Number);
            return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
          };
          if (!this.uMonth || (this.uMonth !== "all" && this.uMonth !== "perm" && !months.includes(this.uMonth))) this.uMonth = months[0] || "perm";
          this.uStatus ||= "open";
          const monthOpts = [["all", "Todos os períodos"], ...months.map((k) => [k, monthName(k)]), ["perm", "Conquistas permanentes"]];
          filterBar = `<div class="mission-filters"><label>Período<select data-u-month>${monthOpts.map(([v, l]) => `<option value="${v}" ${v === this.uMonth ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label><label>Status<select data-u-status>${[["open", "Não concluídas"], ["done", "Concluídas"], ["all", "Todas"]].map(([v, l]) => `<option value="${v}" ${v === this.uStatus ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>`;
          items = items
            .filter((m) => (this.uMonth === "all" ? true : this.uMonth === "perm" ? !m.month : m.month === this.uMonth))
            .filter((m) => (this.uStatus === "all" ? true : this.uStatus === "done" ? m.completed : !m.completed));
        }
        if (!items.length && filterBar) {
          summary.innerHTML = "";
          body.innerHTML = filterBar + `<div class="empty-state"><h3>Nada por aqui</h3><p>Nenhuma missão com esses filtros.</p></div>`;
          this.bindFilters(body);
        } else if (!items.length) {
          summary.innerHTML = "";
          body.innerHTML = `<div class="empty-state"><h3>${MM.loading ? "Carregando missões…" : online ? "Nenhuma missão carregada" : "OFFLINE"}</h3><p>${online ? "" : "Conecte-se para sincronizar suas missões."}</p></div>`;
        } else {
          const main = items.filter((m) => !m.final),
            final = items.find((m) => m.final),
            done = main.filter((m) => m.completed).length,
            claimed = items.filter((m) => m.claimed).length;
          const periodic = this.tab !== "unique";
          summary.innerHTML = `<div class="ms-stat"><span>${periodic ? "RENOVA EM" : "PERMANENTES"}</span><b data-countdown="${this.tab}">${periodic ? countdown(MM.endsIn(this.tab)) : "NUNCA RESETAM"}</b></div>
            <div class="ms-stat"><span>CONCLUÍDAS</span><b>${done} / ${main.length}</b></div>
            <div class="ms-stat"><span>RESGATADAS</span><b>${claimed} / ${items.length}</b></div>
            <div class="ms-track"><i style="width:${(100 * done) / Math.max(1, main.length)}%"></i></div>
            <p class="ms-note">${periodic ? `Complete as ${main.length} missões para liberar a recompensa final.` : "100 missões novas todo mês. As que você não terminar continuam aqui e acumulam com as do mês seguinte."}</p>`;
          const sorted = periodic ? main : [...main].sort((a, b) => Number(a.claimed) - Number(b.claimed) || Number(b.completed) - Number(a.completed) || b.progress / b.target - a.progress / a.target);
          body.innerHTML = filterBar + sorted.map((m) => this.card(m)).join("") + (final ? this.card(final) : "");
          this.bindFilters(body);
        }
      }
      $("missions-offline").classList.toggle("hidden", !signed || online);
      const ready = MM.claimable();
      const idx = DR.Bestiary.claimable();
      $("missionsbadge").textContent = !signed ? "Requer conta" : ready ? `${ready} pronta${ready > 1 ? "s" : ""} para resgatar` : "Diárias, semanais e únicas";
      $("missionsbtn").classList.toggle("has-reward", ready > 0);
      $("indexbadge").textContent = !signed ? "Requer conta" : idx ? `${idx} recompensa${idx > 1 ? "s" : ""} disponíve${idx > 1 ? "is" : "l"}` : "Bestiário e marcos de abate";
      $("indexbtn").classList.toggle("has-reward", idx > 0);
      this.renderTracker();
    },
    bindFilters(body) {
      const m = body.querySelector("[data-u-month]"),
        s = body.querySelector("[data-u-status]");
      if (m) m.onchange = () => { this.uMonth = m.value; this.render(); };
      if (s) s.onchange = () => { this.uStatus = s.value; this.render(); };
    },
    renderTimers() {
      document.querySelectorAll("[data-countdown]").forEach((el) => {
        const ms = DR.MissionManager.endsIn(el.dataset.countdown);
        el.textContent = countdown(ms);
        if (ms === 0) this.refresh();
      });
    },
    // Compact in-match list: the missions closest to completion (ready-to-claim first).
    renderTracker() {
      const box = $("missiontracker");
      if (!box) return;
      const signed = this.game.signedIn();
      const list = (DR.MissionManager.list || []).filter((m) => !m.claimed && !m.final);
      if (!signed || !list.length) {
        box.classList.add("empty");
        return;
      }
      box.classList.remove("empty");
      const top = list
        .map((m) => DR.describeMission(m))
        .sort((a, b) => Number(b.completed) - Number(a.completed) || b.pct - a.pct)
        .slice(0, 3);
      const K = DR.Keybinds;
      box.querySelector(".mt-list").innerHTML = top
        .map(
          (m) => `<li class="${m.completed ? "done" : ""}" style="--rarity:${m.color}"><span class="mt-cat">${DR.MissionCategories[m.category]?.short || ""}</span><b>${esc(m.title)}</b><i><em style="width:${m.pct}%"></em></i><small>${m.completed ? "PRONTA ✓" : esc(m.progressText)}</small></li>`,
        )
        .join("");
      box.querySelector(".mt-key").textContent = K ? `${K.label(K.code("freeMouse"))} solta o mouse · ${K.label(K.code("missions"))} abre` : "";
    },
    async claim(id, button) {
      if (this.claiming.has(id)) return;
      if (!DR.Backend.isOnline()) {
        this.game.toast("Conecte-se para resgatar a recompensa.");
        return;
      }
      this.claiming.add(id);
      button.disabled = true;
      button.textContent = "RESGATANDO…";
      try {
        const r = await DR.MissionManager.claim(id);
        this.game.applyProfile(r.profile);
        this.showReward(DR.describeMission({ ...r.claimed, progress: r.claimed.target, completed: true }), r.claimed.final ? "RECOMPENSA FINAL" : null);
      } catch (e) {
        this.game.toast(e.message);
        if (["already_claimed", "mission_expired"].includes(e.code)) await this.refresh();
      } finally {
        this.claiming.delete(id);
        this.render();
      }
    },
    showReward(m, label = null) {
      const box = $("missionreward");
      box.style.setProperty("--rarity", m.color);
      box.querySelector(".reward-rarity").textContent = label || `MISSÃO ${m.rarityName}`;
      box.querySelector("strong").textContent = "RECOMPENSA RESGATADA";
      box.querySelector("h3").textContent = m.title;
      box.querySelector(".reward-list").innerHTML = m.rewards.map((r) => `<li>${esc(r)}</li>`).join("");
      box.classList.remove("hidden");
      this.game.sound("reward", m);
    },

    // ── INDEX ────────────────────────────────────────────────────────────────────────────
    async openIndex(from = null) {
      this.from = from;
      if (!from && this.game.animateTo) await this.game.animateTo("indexscreen");
      this.game.screen("indexscreen");
      $("indexscreen").classList.toggle("in-match", this.inMatch());
      this.renderIndex();
      await this.refreshIndex();
    },
    async refreshIndex() {
      if (!this.game.signedIn()) return this.renderIndex();
      try {
        await DR.Bestiary.refresh();
      } catch (e) {
        this.game.toast(e.message);
      }
    },
    renderIndex() {
      const body = $("index-list");
      if (!body) return;
      const B = DR.Bestiary,
        signed = this.game.signedIn();
      const total = B.list.reduce((a, e) => a + Number(e.kills || 0), 0),
        found = B.list.filter((e) => e.kills > 0).length,
        ready = B.claimable();
      $("index-summary").innerHTML = signed && B.list.length
        ? `<div class="ms-stat"><span>ESPÉCIES ENCONTRADAS</span><b>${found} / ${B.list.length}</b></div><div class="ms-stat"><span>ELIMINAÇÕES REGISTRADAS</span><b>${n(total)}</b></div><div class="ms-stat ${ready ? "hot" : ""}"><span>PARA RESGATAR</span><b>${ready}</b></div>`
        : "";
      if (!signed) {
        body.innerHTML = `<div class="empty-state"><h3>O Índice exige uma conta</h3><p>Cada inimigo eliminado conta para o seu bestiário. Marcos de abate liberam moedas, XP e tickets.</p><button class="primary" data-go-login type="button">ENTRAR / CRIAR CONTA</button></div>`;
        body.querySelector("[data-go-login]").onclick = () => this.game.openLogin();
      } else if (!B.list.length) {
        body.innerHTML = `<div class="empty-state"><h3>${B.loading ? "Carregando o Índice…" : DR.Backend.isOnline() ? "Índice vazio" : "OFFLINE"}</h3></div>`;
      } else {
        body.innerHTML = B.list.map((e) => this.enemyCard(e)).join("");
        this.game.monsterPortraits?.(body);
      }
      this.render();
    },
    enemyCard(e) {
      const info = DR.Bestiary.info(e.key),
        seen = e.kills > 0,
        prevMark = Number(e.claimedTier) > 0 ? this.prevMilestone(e) : 0,
        pct = Math.min(100, (100 * (e.kills - prevMark)) / Math.max(1, e.next - prevMark));
      return `<article class="enemy-card ${seen ? "" : "unknown"} ${e.boss ? "boss" : ""} ${e.claimable > 0 ? "ready" : ""}">
        <div class="enemy-portrait" data-portrait="${esc(e.key)}"><span>${seen ? "" : "?"}</span></div>
        <div class="enemy-body">
          <header><h3>${seen ? esc(info.name) : "Desconhecido"}</h3>${e.boss ? '<span class="enemy-tag">CHEFE</span>' : ""}<span class="enemy-tier">NÍVEL ${n(e.claimedTier)}</span></header>
          <p>${seen ? esc(info.desc) : "Elimine este inimigo para registrá-lo no Índice."}</p>
          <div class="enemy-kills"><b>${n(e.kills)}</b><span>eliminados · próximo marco ${n(e.next)}</span></div>
          <div class="mission-progress"><i style="width:${e.claimable > 0 ? 100 : pct}%"></i></div>
          <div class="enemy-foot"><span class="mission-rewards">${rewardChips(e.nextReward || {})}</span>${
            e.claimable > 0 ? `<button class="claim-btn" data-claim-enemy="${esc(e.key)}" type="button">RESGATAR${e.claimable > 1 ? ` ×${e.claimable}` : ""}</button>` : ""
          }</div>
        </div>
      </article>`;
    },
    // Mirrors public._bestiary_milestone for the previous tier (progress bar start).
    prevMilestone(e) {
      const t = Number(e.claimedTier);
      if (t < 1) return 0;
      if (!e.boss) return t <= 8 ? [1, 5, 25, 50, 100, 250, 500, 1000][t - 1] : Math.round((1000 * Math.pow(1.6, t - 8)) / 50) * 50;
      return t <= 12 ? [1, 3, 5, 8, 10, 15, 20, 30, 40, 50, 75, 100][t - 1] : Math.round((100 * Math.pow(1.4, t - 12)) / 5) * 5;
    },
    async claimEnemy(key, button) {
      if (this.claiming.has(key)) return;
      if (!DR.Backend.isOnline()) return this.game.toast("Conecte-se para resgatar a recompensa.");
      this.claiming.add(key);
      button.disabled = true;
      button.textContent = "RESGATANDO…";
      try {
        const r = await DR.Bestiary.claim(key);
        this.game.applyProfile(r.profile);
        const c = r.claimed;
        if (c) {
          const rewards = [`+${n(c.coins)} moedas`, `+${n(c.xp)} XP`];
          if (c.normal) rewards.push(`+${c.normal} ticket${c.normal > 1 ? "s" : ""}`);
          if (c.lucky) rewards.push(`+${c.lucky} Lucky`);
          this.showReward({ color: "#9dff45", rarityName: "", title: `${DR.Bestiary.info(key).name} · nível ${c.tier}`, rewards }, `ÍNDICE · ${c.tiers} MARCO${c.tiers > 1 ? "S" : ""}`);
        }
      } catch (e) {
        this.game.toast(e.message);
        await this.refreshIndex();
      } finally {
        this.claiming.delete(key);
        this.renderIndex();
      }
    },
  };

  DR.MissionUI = MissionUI;
})();
