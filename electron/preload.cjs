const { contextBridge, ipcRenderer } = require("electron");

const allowedEvents = new Set([
  "shortcut-pressed",
  "shortcut-released",
  "assistant-shortcut",
  "word-learned",
  "deep-link",
  "backend-warning",
]);

contextBridge.exposeInMainWorld("listenOS", {
  invoke: (command, args) => ipcRenderer.invoke("desktop:invoke", command, args),
  on: (eventName, callback) => {
    if (!allowedEvents.has(eventName)) throw new Error(`Blocked desktop event: ${eventName}`);
    const listener = (_event, incomingEvent, payload) => {
      if (incomingEvent === eventName) callback(payload);
    };
    ipcRenderer.on("desktop:event", listener);
    return () => ipcRenderer.removeListener("desktop:event", listener);
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    close: () => ipcRenderer.invoke("window:close"),
  },
  updates: {
    check: (silent) => ipcRenderer.invoke("updates:check", silent),
  },
  platform: process.platform,
});
