// AuthService — Supabase Auth (email/password + Google OAuth with PKCE) with friendly errors.
// Works on file:// (Android WebView, Electron) and http(s) (browser). No secrets on the client.
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});

  const MESSAGES = {
    invalid_email: "E-mail inválido.",
    email_taken: "Este e-mail já está cadastrado. Entre ou recupere a senha.",
    invalid_credentials: "E-mail ou senha incorretos. Ainda não tem conta? Crie uma.",
    email_not_confirmed: "Confirme seu e-mail antes de entrar. Reenviamos o link se precisar.",
    weak_password: "A senha precisa ter pelo menos 8 caracteres, com letras e números.",
    password_mismatch: "As senhas não coincidem.",
    username_taken: "Esse nome de usuário já está em uso.",
    invalid_username: "Nome de usuário: 3–20 letras, números ou _.",
    network: "Sem conexão com o servidor. Verifique sua internet.",
    session_expired: "Sua sessão expirou. Entre novamente.",
    rate_limit: "Muitas tentativas seguidas. Aguarde um minuto.",
    email_limit: "O servidor atingiu o limite de e-mails por hora. Tente de novo mais tarde ou entre com Google.",
    oauth_failed: "Não foi possível concluir o login com Google.",
    oauth_cancelled: "Login com Google cancelado.",
    google_disabled: "Login com Google ainda não está ativado no servidor. Use e-mail e senha por enquanto.",
    link_expired: "Este link expirou ou já foi usado. Peça um novo.",
    same_password: "A nova senha precisa ser diferente da atual.",
    unavailable: "Serviço de contas indisponível no momento.",
    unknown: "Algo deu errado. Tente novamente.",
  };

  class AuthError extends Error {
    constructor(code, detail) {
      super(MESSAGES[code] || detail || MESSAGES.unknown);
      this.code = code;
      this.detail = detail;
    }
  }

  // Maps Supabase/GoTrue/fetch errors to our small set of player-facing codes.
  function classify(error) {
    if (!error) return new AuthError("unknown");
    if (error instanceof AuthError) return error;
    const code = String(error.code || error.error_code || "").toLowerCase();
    const msg = String(error.message || error.msg || error).toLowerCase();
    const status = error.status || 0;
    if (error.name === "AuthRetryableFetchError" || /failed to fetch|network|load failed|timeout|fetch/.test(msg) && !status)
      return new AuthError("network", error.message);
    if (code === "invalid_credentials" || /invalid login credentials/.test(msg)) return new AuthError("invalid_credentials");
    if (code === "email_not_confirmed" || /email not confirmed/.test(msg)) return new AuthError("email_not_confirmed");
    if (code === "user_already_exists" || code === "email_exists" || /already registered|already been registered/.test(msg)) return new AuthError("email_taken");
    if (code === "email_address_invalid" || code === "validation_failed" && /email/.test(msg) || /invalid email|unable to validate email/.test(msg))
      return new AuthError("invalid_email");
    if (code === "weak_password" || /password should be|weak password/.test(msg)) return new AuthError("weak_password");
    if (code === "same_password") return new AuthError("same_password");
    if (/over_email_send_rate_limit|email rate limit/.test(code + msg)) return new AuthError("email_limit");
    if (/rate limit|too many|over_email_send_rate_limit|over_request_rate_limit/.test(code + msg) || status === 429) return new AuthError("rate_limit");
    if (/refresh token|session.*(missing|expired|not found)|jwt expired/.test(code + msg)) return new AuthError("session_expired");
    if (/otp_expired|flow_state|code verifier|invalid.*(grant|code)|expired/.test(code + msg)) return new AuthError("link_expired");
    if (status >= 500) return new AuthError("unavailable", error.message);
    return new AuthError("unknown", error.message);
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const AuthService = {
    client: null,
    session: null,
    listeners: new Set(),
    pendingRecovery: false,
    MESSAGES,
    AuthError,
    classify,

    available() {
      return !!(window.supabase && window.DR_CONFIG && this.client);
    },

    init() {
      if (this.client || !window.supabase || !window.DR_CONFIG) return this.client;
      const cfg = window.DR_CONFIG;
      this.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: "deadrecoil.auth",
        },
        realtime: { params: { eventsPerSecond: 40 } },
      });
      this.client.auth.onAuthStateChange((event, session) => {
        this.session = session;
        if (event === "PASSWORD_RECOVERY") this.pendingRecovery = true;
        for (const fn of this.listeners) {
          try {
            fn(event, session);
          } catch (e) {
            console.warn("[auth] listener failed", e);
          }
        }
      });
      return this.client;
    },

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },

    // Where OAuth / email links should come back to.
    redirectUrl(kind = "") {
      const native = window.DeadRecoilRuntime?.native || window.DeadRecoilDesktop?.isDesktop;
      const base = native || location.protocol === "file:" ? window.DR_CONFIG.authCallback : location.origin + location.pathname;
      return kind ? `${base}${base.includes("?") ? "&" : "?"}type=${kind}` : base;
    },

    async restore() {
      if (!this.init()) return null;
      try {
        const { data, error } = await this.client.auth.getSession();
        if (error) throw error;
        this.session = data.session;
        return data.session;
      } catch (e) {
        throw classify(e);
      }
    },

    validateEmail(email) {
      if (!EMAIL_RE.test(String(email || "").trim())) throw new AuthError("invalid_email");
    },

    validatePassword(password) {
      if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new AuthError("weak_password");
    },

    async signIn(email, password) {
      this.validateEmail(email);
      if (!password) throw new AuthError("invalid_credentials");
      try {
        const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        return data.session;
      } catch (e) {
        throw classify(e);
      }
    },

    async signUp({ username, email, password, confirm }) {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username || "")) throw new AuthError("invalid_username");
      this.validateEmail(email);
      this.validatePassword(password);
      if (password !== confirm) throw new AuthError("password_mismatch");
      try {
        const { data: free, error: nameError } = await this.client.rpc("username_available", { p_username: username });
        if (nameError) throw nameError;
        if (!free) throw new AuthError("username_taken");
        const { data, error } = await this.client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username, display_name: username }, emailRedirectTo: this.redirectUrl("signup") },
        });
        if (error) throw error;
        // With confirmations on, GoTrue answers an existing address with a user without identities.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new AuthError("email_taken");
        return { needsConfirmation: !data.session, session: data.session, email: email.trim() };
      } catch (e) {
        throw classify(e);
      }
    },

    async resendConfirmation(email) {
      this.validateEmail(email);
      try {
        const { error } = await this.client.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: this.redirectUrl("signup") } });
        if (error) throw error;
      } catch (e) {
        throw classify(e);
      }
    },

    async requestPasswordReset(email) {
      this.validateEmail(email);
      try {
        const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: this.redirectUrl("recovery") });
        if (error) throw error;
      } catch (e) {
        throw classify(e);
      }
    },

    async updatePassword(password, confirm) {
      this.validatePassword(password);
      if (password !== confirm) throw new AuthError("password_mismatch");
      try {
        const { error } = await this.client.auth.updateUser({ password });
        if (error) throw error;
        this.pendingRecovery = false;
      } catch (e) {
        throw classify(e);
      }
    },

    // Official Google OAuth: the provider page opens in the system browser / Custom Tab and returns
    // through the untitledzombie:// deep link (or the page URL on the web). No embedded login form.
    // Public auth settings (which providers are on, whether e-mail must be confirmed). Cached.
    async settings() {
      if (this._settings) return this._settings;
      const cfg = window.DR_CONFIG || {};
      const url = (cfg.supabaseUrl || cfg.url || "").replace(/\/$/, "");
      const key = cfg.supabaseKey || cfg.publishableKey || cfg.anonKey || "";
      if (!url || !key) return null;
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: ctl.signal });
        clearTimeout(timer);
        if (!r.ok) return null;
        this._settings = await r.json();
        return this._settings;
      } catch {
        return null;
      }
    },
    async googleEnabled() {
      const st = await this.settings();
      return st ? !!st.external?.google : null;
    },
    async signInWithGoogle() {
      if ((await this.googleEnabled()) === false) throw new AuthError("google_disabled");
      try {
        // Windows app: the browser comes back to a one-shot local server run by the game
        // (http://127.0.0.1:<port>/auth/callback), so no "open app?" prompt can get in the way.
        let redirectTo = this.redirectUrl("oauth");
        try {
          const loop = await window.DeadRecoilDesktop?.startAuthLoopback?.();
          if (loop) redirectTo = `${loop}?type=oauth`;
        } catch {}
        const external = !!(window.DeadRecoilNative?.openAuthUrl || window.DeadRecoilDesktop?.openExternal);
        const { data, error } = await this.client.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: external, queryParams: { prompt: "select_account" } },
        });
        if (error) throw error;
        if (external && data?.url) DR.GoogleAuth.open(data.url);
        return true;
      } catch (e) {
        throw e instanceof AuthError ? e : new AuthError(classify(e).code === "network" ? "network" : "oauth_failed", e.message);
      }
    },

    // Handles untitledzombie://auth/callback?code=…&type=… (or the web URL). Returns what happened.
    async handleCallback(url) {
      if (!this.init()) return { ok: false };
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return { ok: false, error: new AuthError("oauth_failed") };
      }
      const params = new URLSearchParams(parsed.search);
      const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
      const type = params.get("type") || hash.get("type") || "";
      const err = params.get("error_description") || hash.get("error_description") || params.get("error") || hash.get("error");
      if (err) {
        const code = /cancel|denied|access_denied/i.test(err) ? "oauth_cancelled" : /expired|invalid/i.test(err) ? "link_expired" : "oauth_failed";
        return { ok: false, type, error: new AuthError(code, err) };
      }
      const code = params.get("code");
      try {
        if (code) {
          const { data, error } = await this.client.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (type === "recovery") this.pendingRecovery = true;
          return { ok: true, type, session: data.session };
        }
        // Implicit-flow fallback (tokens in the fragment).
        const access = hash.get("access_token"), refresh = hash.get("refresh_token");
        if (access && refresh) {
          const { data, error } = await this.client.auth.setSession({ access_token: access, refresh_token: refresh });
          if (error) throw error;
          if (type === "recovery") this.pendingRecovery = true;
          return { ok: true, type, session: data.session };
        }
        return { ok: false, type, error: new AuthError("link_expired") };
      } catch (e) {
        // A confirmation link opened on another device has no PKCE verifier here: the e-mail IS
        // confirmed server-side, the player only needs to sign in with the password.
        if (type === "signup") return { ok: false, type, confirmedElsewhere: true, error: new AuthError("link_expired") };
        return { ok: false, type, error: classify(e) };
      }
    },

    async signOut() {
      try {
        await this.client?.auth.signOut({ scope: "local" });
      } catch {
        /* Offline sign-out still clears the local session below. */
      }
      try {
        localStorage.removeItem("deadrecoil.auth");
      } catch {}
      this.session = null;
    },

    user() {
      return this.session?.user || null;
    },
  };

  DR.AuthService = AuthService;
})();
