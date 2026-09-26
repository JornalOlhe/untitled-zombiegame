// LoginUI — login / register / verify e-mail / forgot + reset password / play offline.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const LoginUI = {
    game: null,
    view: "login",
    pendingEmail: "",
    init(game) {
      this.game = game;
      const root = $("loginscreen");
      root.addEventListener("click", (e) => {
        const b = e.target.closest("[data-auth-view]");
        if (b) {
          e.preventDefault();
          this.show(b.dataset.authView);
        }
      });
      $("login-form").onsubmit = (e) => (e.preventDefault(), this.login());
      $("register-form").onsubmit = (e) => (e.preventDefault(), this.register());
      $("forgot-form").onsubmit = (e) => (e.preventDefault(), this.forgot());
      $("reset-form").onsubmit = (e) => (e.preventDefault(), this.reset());
      $("google-btn").onclick = () => this.google();
      $("google-btn-2").onclick = () => this.google();
      $("resend-btn").onclick = () => this.resend();
      $("offline-btn").onclick = () => this.game.playOffline();
      $("verify-done").onclick = () => this.show("login");
      for (const id of ["reg-password", "reset-password"]) $(id).addEventListener("input", (e) => this.strength(e.target));
    },
    open(view = "login", message = "") {
      this.game.screen("loginscreen");
      this.checkGoogle();
      this.show(view);
      if (message) this.message(message, view === "login" && /expirou|confirm/i.test(message) ? "warn" : "info");
    },
    // Tell the player up front when the Google provider is still off on the server.
    checkGoogle() {
      if (this.googleChecked) return;
      this.googleChecked = true;
      DR.AuthService.googleEnabled?.().then((on) => {
        for (const id of ["google-btn", "google-btn-2"]) {
          const el = $(id);
          if (!el) continue;
          el.classList.toggle("is-off", on === false);
          el.title = on === false ? "Login com Google ainda não ativado" : "";
        }
      });
    },
    show(view) {
      this.view = view;
      for (const el of document.querySelectorAll("#loginscreen [data-view]")) el.classList.toggle("hidden", el.dataset.view !== view);
      this.message("");
      const online = DR.Backend.isOnline() || navigator.onLine !== false;
      $("login-offline-note").classList.toggle("hidden", online);
      requestAnimationFrame(() => document.querySelector(`#loginscreen [data-view="${view}"] input`)?.focus({ preventScroll: true }));
    },
    message(text, tone = "error") {
      const el = document.querySelector(`#loginscreen [data-view="${this.view}"] .auth-msg`);
      if (!el) return;
      el.textContent = text || "";
      el.dataset.tone = tone;
    },
    busy(form, on) {
      for (const b of form.querySelectorAll("button, input")) b.disabled = on;
      form.classList.toggle("busy", on);
    },
    strength(input) {
      const v = input.value,
        score = (v.length >= 8) + /[A-Z]/.test(v) + /[a-z]/.test(v) + /\d/.test(v) + /[^A-Za-z0-9]/.test(v) + (v.length >= 12);
      input.closest("label").style.setProperty("--strength", Math.min(1, score / 6));
    },
    async run(form, fn) {
      this.busy(form, true);
      try {
        await fn();
      } catch (e) {
        this.message(e.message || String(e));
        if (e.code === "email_not_confirmed") {
          this.pendingEmail = $("login-email").value.trim();
          const link = document.createElement("button");
          link.type = "button";
          link.className = "auth-inline";
          link.textContent = "Reenviar e-mail de confirmação";
          link.onclick = () => this.showVerify(this.pendingEmail);
          document.querySelector('#loginscreen [data-view="login"] .auth-msg').append(" ", link);
        }
      } finally {
        this.busy(form, false);
      }
    },
    login() {
      const form = $("login-form");
      return this.run(form, async () => {
        await DR.AuthService.signIn($("login-email").value, $("login-password").value);
        $("login-password").value = "";
        await this.game.afterSignIn();
      });
    },
    register() {
      const form = $("register-form");
      return this.run(form, async () => {
        const r = await DR.AuthService.signUp({
          username: $("reg-username").value.trim(),
          email: $("reg-email").value,
          password: $("reg-password").value,
          confirm: $("reg-confirm").value,
        });
        $("reg-password").value = $("reg-confirm").value = "";
        if (r.needsConfirmation) this.showVerify(r.email);
        else await this.game.afterSignIn();
      });
    },
    showVerify(email) {
      this.pendingEmail = email;
      this.show("verify");
      $("verify-email").textContent = email;
    },
    async resend() {
      const b = $("resend-btn");
      b.disabled = true;
      try {
        await DR.AuthService.resendConfirmation(this.pendingEmail);
        this.message("E-mail reenviado. Confira também o spam.", "ok");
        let left = 45;
        const tick = setInterval(() => {
          b.textContent = `REENVIAR EM ${--left}s`;
          if (left <= 0) {
            clearInterval(tick);
            b.textContent = "REENVIAR E-MAIL";
            b.disabled = false;
          }
        }, 1000);
      } catch (e) {
        this.message(e.message);
        b.disabled = false;
      }
    },
    forgot() {
      const form = $("forgot-form");
      return this.run(form, async () => {
        await DR.AuthService.requestPasswordReset($("forgot-email").value);
        this.message("Se existir uma conta com esse e-mail, enviamos o link para redefinir a senha.", "ok");
      });
    },
    reset() {
      const form = $("reset-form");
      return this.run(form, async () => {
        await DR.AuthService.updatePassword($("reset-password").value, $("reset-confirm").value);
        $("reset-password").value = $("reset-confirm").value = "";
        this.game.toast("Senha atualizada. Você está conectado.");
        await this.game.afterSignIn();
      });
    },
    async google() {
      this.message("Abrindo o login oficial do Google…", "info");
      try {
        await DR.AuthService.signInWithGoogle();
        if (window.DeadRecoilNative?.openAuthUrl || window.DeadRecoilDesktop?.openExternal)
          this.message("Conclua o login no navegador. O jogo volta sozinho quando terminar.", "info");
      } catch (e) {
        this.message(e.message);
      }
    },
    // Result of a deep-link callback (OAuth, e-mail confirmation, password recovery).
    async callback(result) {
      if (result.ok) {
        if (result.type === "recovery" || DR.AuthService.pendingRecovery) {
          this.open("reset");
          this.message("Defina sua nova senha.", "info");
          return;
        }
        if (result.type === "signup") this.game.toast("E-mail confirmado. Bem-vindo!");
        await this.game.afterSignIn();
        return;
      }
      if (result.confirmedElsewhere) {
        this.open("login", "E-mail confirmado! Agora entre com seu e-mail e senha.");
        return;
      }
      this.open("login", result.error?.message || DR.AuthService.MESSAGES.oauth_failed);
    },
  };

  DR.LoginUI = LoginUI;
  DR.escapeHtml = esc;
})();
