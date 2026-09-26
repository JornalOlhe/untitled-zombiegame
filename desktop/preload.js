// Minimal, audited bridge for the sandboxed renderer: open the official OAuth page in the
// system browser, collect a login deep link that arrived at startup, and quit the game.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("DeadRecoilDesktop", {
  isDesktop: true,
  openExternal: (url) => ipcRenderer.invoke("dr:open-external", String(url || "")),
  takePendingAuthUrl: () => ipcRenderer.invoke("dr:take-pending-auth"),
  startAuthLoopback: () => ipcRenderer.invoke("dr:auth-loopback"),
});
contextBridge.exposeInMainWorld("deadRecoilNative", {
  quit: () => ipcRenderer.invoke("dr:quit"),
});
