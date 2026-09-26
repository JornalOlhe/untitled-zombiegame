// MissionUI — the MISSIONS screen, the home preview and the MISSION COMPLETE / CLAIM flow.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => DR.escapeHtml(s);

  const MissionUI = {
    game: null,
    claiming: new Set(),
    init(game) {
      this.game = game;
      DR.MissionManager.onChange((list, extra = {}) => {
        this.render();
        for (const m of extra.completed || []) this.game.missionToast(DR.describeMission(m));
      });
      $("missionscreen").addEventListener("click", (e) => {
        const b = e.target.closest("[data-claim]");
        if (b) this.claim(Number(b.dataset.claim), b);
      });
      $("missions-refresh").onclick = () => this.refresh();
      $("mission-reward-ok").onclick = () => $("missionreward").classList.add("hidden");
    },
    async open() {
      this.game.screen("missionscreen");
      this.render();
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
    card(raw, compact = false) {
      const m = DR.describeMission(raw);
      const done = m.completed;
      const claimBtn = done && !compact ? `<button class="claim-btn" data-claim="${m.id}">COLETAR</button>` : "";
      return `<article class="mission-card ${done ? "done" : ""} ${compact ? "compact" : ""}" style="--rarity:${m.color}">
        <header><span class="mission-icon">${m.icon}</span><span class="mission-rarity">${m.rarityName}</span>${done ? '<span class="mission-flag">CONCLUÍDA</span>' : ""}</header>
        <h3>${esc(m.title)}</h3>
        <div class="mission-progress"><i style="width:${m.pct}%"></i></div>
        <div class="mission-meta"><b>${Number(m.progress).toLocaleString("pt-BR")} / ${Number(m.target).toLocaleString("pt-BR")}</b><span>${m.rewards.map(esc).join(" · ")}</span></div>
        ${claimBtn}
      </article>`;
    },
    render() {
      const list = DR.MissionManager.list || [];
      const signed = this.game.signedIn();
      const online = DR.Backend.isOnline();
      const body = $("mission-list");
      if (!signed) {
        body.innerHTML = `<div class="empty-state"><h3>Missões exigem uma conta</h3><p>Entre para receber 3 missões infinitas, ganhar moedas, XP e manter o progresso no PC e no Android.</p><button class="primary" data-go-login>ENTRAR / CRIAR CONTA</button></div>`;
        body.querySelector("[data-go-login]").onclick = () => this.game.openLogin();
      } else if (!list.length) {
        body.innerHTML = `<div class="empty-state"><h3>${DR.MissionManager.loading ? "Carregando missões…" : online ? "Nenhuma missão carregada" : "OFFLINE"}</h3><p>${online ? "" : "Conecte-se para sincronizar suas missões."}</p></div>`;
      } else body.innerHTML = list.map((m) => this.card(m)).join("");
      $("missions-offline").classList.toggle("hidden", !signed || online);
      const preview = $("home-missions");
      if (preview) {
        preview.innerHTML = signed
          ? list.length
            ? list.map((m) => this.card(m, true)).join("")
            : `<p class="home-hint">${online ? "Carregando missões…" : "Missões offline"}</p>`
          : `<p class="home-hint">Entre na sua conta para desbloquear missões infinitas.</p>`;
        const ready = list.filter((m) => m.completed).length;
        $("missionsbadge").textContent = !signed ? "Requer conta" : ready ? `${ready} pronta${ready > 1 ? "s" : ""} para coletar` : `${list.length} ativas`;
        $("missionsbtn").classList.toggle("has-reward", ready > 0);
      }
    },
    async claim(id, button) {
      if (this.claiming.has(id)) return;
      if (!DR.Backend.isOnline()) {
        this.game.toast("Conecte-se para coletar a recompensa.");
        return;
      }
      this.claiming.add(id);
      button.disabled = true;
      button.textContent = "COLETANDO…";
      try {
        const r = await DR.MissionManager.claim(id);
        this.game.applyProfile(r.profile);
        this.showReward(DR.describeMission({ ...r.claimed, progress: r.claimed.target, completed: true }));
      } catch (e) {
        this.game.toast(e.message);
        if (e.code === "already_claimed") await this.refresh();
      } finally {
        this.claiming.delete(id);
        this.render();
      }
    },
    showReward(m) {
      const box = $("missionreward");
      box.style.setProperty("--rarity", m.color);
      box.querySelector(".reward-rarity").textContent = `MISSÃO ${m.rarityName}`;
      box.querySelector("h3").textContent = m.title;
      box.querySelector(".reward-list").innerHTML = m.rewards.map((r) => `<li>${esc(r)}</li>`).join("");
      box.classList.remove("hidden");
      this.game.sound("reward", m);
    },
  };

  DR.MissionUI = MissionUI;
})();
