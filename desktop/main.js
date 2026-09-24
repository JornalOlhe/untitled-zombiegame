const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const smokeTest = process.argv.includes("--smoke-test");
let mainWindow = null;
let smokeTimeout = null;

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
    if (!smokeTest) mainWindow.maximize();
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
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
