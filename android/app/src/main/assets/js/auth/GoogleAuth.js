// GoogleAuth — platform hand-off for the official OAuth page and the deep-link return.
//   Android: DeadRecoilNative.openAuthUrl → Chrome Custom Tab; the intent-filter for
//            untitledzombie://auth/callback reopens the game and native code calls
//            window.DeadRecoilAuthCallback(url).
//   Windows: DeadRecoilDesktop.openExternal → default browser; the registered protocol
//            brings the running game back to front and forwards the URL the same way.
//   Browser: normal redirect back to the page (?code=…).
(function () {
  "use strict";
  const DR = (window.DR = window.DR || {});
  const queue = [];
  const seen = new Set();
  let handler = null;

  const GoogleAuth = {
    open(url) {
      if (window.DeadRecoilNative?.openAuthUrl) window.DeadRecoilNative.openAuthUrl(url);
      else if (window.DeadRecoilDesktop?.openExternal) window.DeadRecoilDesktop.openExternal(url);
      else location.assign(url);
    },
    // The game registers its callback handler once it is ready; earlier URLs are queued.
    setHandler(fn) {
      handler = fn;
      while (queue.length) fn(queue.shift());
    },
    deliver(url) {
      if (!url || !/auth\/callback|[?&#](code|error|access_token)=/.test(url)) return false;
      if (seen.has(url)) return false; // the same link can arrive twice (native + page load)
      seen.add(url);
      if (handler) handler(url);
      else queue.push(url);
      return true;
    },
    // Pulls a callback that arrived before the page loaded (cold start from the deep link).
    collectPending() {
      try {
        const native = window.DeadRecoilNative?.takePendingAuthUrl?.();
        if (native) this.deliver(native);
      } catch {}
      try {
        const desktop = window.DeadRecoilDesktop?.takePendingAuthUrl?.();
        if (desktop && typeof desktop.then === "function") desktop.then((u) => u && this.deliver(u));
        else if (desktop) this.deliver(desktop);
      } catch {}
      // Web: the provider redirected back to this page.
      if (/[?&](code|error)=|#.*access_token=/.test(location.href) && !window.DeadRecoilRuntime?.native) {
        const url = location.href;
        history.replaceState(null, "", location.pathname + (location.search.includes("test=1") ? "?test=1" : ""));
        this.deliver(url);
      }
    },
  };

  window.DeadRecoilAuthCallback = (url) => GoogleAuth.deliver(String(url || ""));
  DR.GoogleAuth = GoogleAuth;
})();
