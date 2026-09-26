const { app, BrowserWindow, Menu, shell, dialog, net, ipcMain } = require("electron");
const path = require("node:path");

const smokeTest = process.argv.includes("--smoke-test");
const RELEASES_API = "https://api.github.com/repos/JornalOlhe/untitled-zombiegame/releases?per_page=20";
const RELEASE_ASSET_PREFIX = "https://github.com/JornalOlhe/untitled-zombiegame/releases/download/";

let mainWindow = null;
// Login deep links (Google OAuth, e-mail confirmation, password reset) come back as
// untitledzombie://auth/callback?code=… and are handed to the running game.
const AUTH_PROTOCOL = "untitledzombie";
let pendingAuthUrl = null;

function authUrlFromArgs(argv) {
  return (argv || []).find((arg) => typeof arg === "string" && arg.startsWith(`${AUTH_PROTOCOL}://`)) || null;
}

function deliverAuthUrl(url) {
  if (!url) return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingAuthUrl = url;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents
    .executeJavaScript(`window.DeadRecoilAuthCallback && window.DeadRecoilAuthCallback(${JSON.stringify(url)})`)
    .catch(() => (pendingAuthUrl = url));
}

if (!smokeTest) {
  // Register the installed .exe (or, for an old portable copy, the real .exe instead of its temp folder).
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient(AUTH_PROTOCOL, exe);
  if (!app.requestSingleInstanceLock()) app.quit();
  app.on("second-instance", (_event, argv) => deliverAuthUrl(authUrlFromArgs(argv)));
  app.on("open-url", (event, url) => {
    event.preventDefault();
    deliverAuthUrl(url);
  });
  pendingAuthUrl = authUrlFromArgs(process.argv);
}

ipcMain.handle("dr:open-external", (_event, url) => {
  if (/^https:\/\//i.test(url)) return shell.openExternal(url);
  return false;
});
// Google sign-in on Windows returns to a one-shot server on 127.0.0.1 (RFC 8252 loopback
// redirect): the browser shows "login concluído" and the game receives the code directly.
const http = require("node:http");
let authServer = null;
const AUTH_DONE_PAGE = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Dead Recoil</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#05080b;color:#f3efe6;font:600 18px system-ui,sans-serif;text-align:center">
<div><div style="font-size:42px;letter-spacing:.08em;color:#d9392b">DEAD RECOIL</div><p>Login concluído. Pode fechar esta aba e voltar ao jogo.</p></div>
<script>setTimeout(()=>window.close(),1500)</script></body></html>`;
ipcMain.handle("dr:auth-loopback", () =>
  new Promise((resolve) => {
    if (authServer) {
      try { authServer.close(); } catch {}
      authServer = null;
    }
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(AUTH_DONE_PAGE);
      deliverAuthUrl(`http://127.0.0.1:${server.address().port}${req.url}`);
      setTimeout(() => server.close(), 500);
      authServer = null;
    });
    server.on("error", () => resolve(null));
    server.listen(0, "127.0.0.1", () => {
      authServer = server;
      // Give up after 10 minutes; the custom-scheme fallback keeps working.
      setTimeout(() => {
        if (authServer === server) {
          server.close();
          authServer = null;
        }
      }, 10 * 60 * 1000).unref();
      resolve(`http://127.0.0.1:${server.address().port}/auth/callback`);
    });
  })
);
ipcMain.handle("dr:take-pending-auth", () => {
  const url = pendingAuthUrl;
  pendingAuthUrl = null;
  return url;
});
ipcMain.handle("dr:quit", () => app.quit());
let smokeTimeout = null;
let updateCheckStarted = false;

app.setName("Dead Recoil");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

if (smokeTest) {
  app.disableHardwareAcceleration();
}

function gameFile() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "game", "index.html");
  }
  return path.join(__dirname, "..", "android", "app", "src", "main", "assets", "index.html");
}

function finishSmoke(code) {
  if (!smokeTest) return;
  if (smokeTimeout) clearTimeout(smokeTimeout);
  app.exit(code);
}

function releaseCodeFromTag(tag) {
  const match = /^v(\d+)$/.exec(String(tag || ""));
  return match ? Number(match[1]) : -1;
}

function installedReleaseCode() {
  const parts = String(app.getVersion() || "0.0.0")
    .split(".")
    .map((value) => Number(value) || 0);

  // Dead Recoil uses 0.N.0 package versions with GitHub tags vN.
  if ((parts[0] || 0) === 0) return parts[1] || 0;
  return parts[0] || 0;
}

// Installed builds (NSIS) update themselves in place: the new installer is downloaded to one
// fixed file in the app's temp folder (no "(1)", "(2)" copies in Downloads), checked against the
// SHA-256 digest GitHub publishes, then run silently; it replaces the installed game and reopens
// it. Save data lives in %APPDATA%\Dead Recoil and is never touched.
const SETUP_ASSET = /^DeadRecoil-Setup-[0-9.]+\.exe$/i;
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

function findWindowsAsset(release) {
  const assets = (release.assets || []).filter(
    (asset) => asset && String(asset.browser_download_url || "").startsWith(RELEASE_ASSET_PREFIX)
  );
  return assets.find((asset) => SETUP_ASSET.test(asset.name)) || null;
}

function isInstalledBuild() {
  // The portable build runs from a temp extraction folder and exposes PORTABLE_EXECUTABLE_FILE.
  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE;
}

function sendStatus(text, progress = -1) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setProgressBar(progress >= 0 ? progress : -1);
  mainWindow.webContents
    .executeJavaScript(`window.DeadRecoilUpdateStatus && window.DeadRecoilUpdateStatus(${JSON.stringify(text)}, ${progress})`)
    .catch(() => {});
}

async function downloadInstaller(asset) {
  const dir = path.join(app.getPath("temp"), "DeadRecoilUpdate");
  fs.mkdirSync(dir, { recursive: true });
  // Only ever one installer on disk: clear old ones first.
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, name), { force: true });
    } catch {}
  }
  const target = path.join(dir, asset.name);
  const partial = target + ".part";
  const response = await net.fetch(asset.browser_download_url, { headers: { "User-Agent": "DeadRecoil-Windows-Updater" } });
  if (!response.ok || !response.body) throw new Error(`download ${response.status}`);
  const total = Number(response.headers.get("content-length")) || asset.size || 0;
  const hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(partial);
  let received = 0,
    lastPct = -1;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    hash.update(chunk);
    received += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    const pct = total ? Math.floor((received / total) * 100) : -1;
    if (pct !== lastPct && pct % 2 === 0) {
      lastPct = pct;
      sendStatus(`Baixando atualização… ${pct}%`, total ? received / total : -1);
    }
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  if (total && received !== total) throw new Error("download incompleto");
  const digest = String(asset.digest || "");
  if (digest.startsWith("sha256:") && digest.slice(7).toLowerCase() !== hash.digest("hex")) throw new Error("verificação falhou");
  fs.renameSync(partial, target);
  return target;
}

async function checkForUpdates() {
  if (smokeTest || updateCheckStarted || !mainWindow || mainWindow.isDestroyed()) return;
  updateCheckStarted = true;

  try {
    const response = await net.fetch(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeadRecoil-Windows-Updater"
      }
    });

    if (!response.ok) return;

    const releases = await response.json();
    const installedCode = installedReleaseCode();

    const newest = releases
      .filter((release) => release && !release.draft)
      .map((release) => ({ release, code: releaseCodeFromTag(release.tag_name) }))
      .filter(({ code }) => code > installedCode)
      .sort((a, b) => b.code - a.code)[0];

    if (!newest || !mainWindow || mainWindow.isDestroyed()) return;

    const { release, code } = newest;
    const asset = findWindowsAsset(release);
    const currentVersion = app.getVersion();
    const releaseName = release.name || release.tag_name || `v${code}`;
    const installed = isInstalledBuild();

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Atualização disponível",
      message: `${releaseName} está disponível (você tem a ${currentVersion}).`,
      detail: installed && asset
        ? "O jogo baixa e instala a atualização sozinho e abre de novo em seguida. Seu progresso é mantido."
        : "Baixe o instalador uma vez: depois disso o jogo passa a se atualizar sozinho, sem arquivos repetidos. Seu progresso é mantido.",
      buttons: [installed && asset ? "Atualizar agora" : "Baixar instalador", "Agora não"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (result.response !== 0) return;

    if (!installed || !asset) {
      const target = asset?.browser_download_url || release.html_url;
      if (target && /^https:\/\//i.test(target)) await shell.openExternal(target);
      return;
    }

    sendStatus("Baixando atualização… 0%", 0);
    let file;
    try {
      file = await downloadInstaller(asset);
    } catch (error) {
      sendStatus("", -1);
      const again = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Atualização",
        message: "Não foi possível baixar a atualização.",
        detail: String(error?.message || error) + "\n\nVocê pode tentar de novo depois ou abrir a página da versão.",
        buttons: ["Abrir página", "Fechar"],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      });
      if (again.response === 0) shell.openExternal(release.html_url);
      return;
    }
    sendStatus("Instalando atualização…", 1);
    // NSIS silent update: replaces the installed files and relaunches the game (--force-run).
    const child = spawn(file, ["/S", "--updated", "--force-run"], { detached: true, stdio: "ignore" });
    child.unref();
    setTimeout(() => app.quit(), 400);
  } catch {
    // Update checks must never prevent offline play.
  }
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    title: "Dead Recoil",
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    show: !smokeTest,
    autoHideMenuBar: true,
    backgroundColor: "#05080b",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) event.preventDefault();
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    if (input.key === "F11" || (input.alt && input.key === "Enter")) {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    if (smokeTest) {
      console.error(`Dead Recoil desktop failed to load: ${code} ${description}`);
      finishSmoke(1);
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingAuthUrl) setTimeout(() => { const url = pendingAuthUrl; pendingAuthUrl = null; deliverAuthUrl(url); }, 1500);
    if (smokeTest) {
      console.log("PASS: desktop runtime loaded the game");
      finishSmoke(0);
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (!smokeTest) {
      mainWindow.maximize();
      setTimeout(checkForUpdates, 900);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadFile(gameFile(), {
    query: {
      platform: "desktop"
    }
  });

  if (smokeTest) {
    smokeTimeout = setTimeout(() => {
      console.error("Desktop smoke test timed out");
      finishSmoke(1);
    }, 20000);
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    updateCheckStarted = false;
    createWindow();
  }
});
