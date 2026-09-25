const { app, BrowserWindow, Menu, shell, dialog, net } = require("electron");
const path = require("node:path");

const smokeTest = process.argv.includes("--smoke-test");
const RELEASES_API = "https://api.github.com/repos/JornalOlhe/untitled-zombiegame/releases?per_page=20";
const RELEASE_ASSET_PREFIX = "https://github.com/JornalOlhe/untitled-zombiegame/releases/download/";

let mainWindow = null;
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

function findWindowsAsset(release) {
  return (release.assets || []).find((asset) =>
    asset &&
    asset.name === "DeadRecoil-Windows.exe" &&
    String(asset.browser_download_url || "").startsWith(RELEASE_ASSET_PREFIX)
  );
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
    const qaText = release.prerelease ? " (versão de testes)" : "";

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Atualização disponível",
      message: `Sua versão ${currentVersion} está desatualizada.`,
      detail:
        `${releaseName}${qaText} está disponível.\n\n` +
        "Baixar a versão mais recente agora?",
      buttons: ["Baixar mais recente", "Agora não"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (result.response !== 0) return;

    const target = asset?.browser_download_url || release.html_url;
    if (target && /^https:\/\//i.test(target)) {
      await shell.openExternal(target);
    }
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
      backgroundThrottling: false
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
