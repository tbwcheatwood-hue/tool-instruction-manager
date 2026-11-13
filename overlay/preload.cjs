const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlay", {
  setInteractive(on) {
    ipcRenderer.send("set-interactive", !!on);
  },
  pull() {
    return ipcRenderer.invoke("pull-state");
  },
  publish(data) {
    ipcRenderer.send("publish", data);
  },
  onState(handler) {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("state", listener);
    return () => ipcRenderer.removeListener("state", listener);
  },
  music(command) {
    ipcRenderer.send("music", command);
  },
  onMusic(handler) {
    const listener = (_event, command) => handler(command);
    ipcRenderer.on("music", listener);
    return () => ipcRenderer.removeListener("music", listener);
  },
  getProfile() {
    return ipcRenderer.invoke("get-profile");
  },
  loadProfile(name) {
    return ipcRenderer.invoke("load-profile", name);
  },
  saveProfile(name, data) {
    return ipcRenderer.invoke("save-profile", name, data);
  },
  onToggleActive(handler) {
    const listener = () => handler();
    ipcRenderer.on("toggle-active", listener);
    return () => ipcRenderer.removeListener("toggle-active", listener);
  },
  onGuideScroll(handler) {
    const listener = (_event, direction) => handler(direction);
    ipcRenderer.on("guide-scroll", listener);
    return () => ipcRenderer.removeListener("guide-scroll", listener);
  },
  onProfile(handler) {
    const listener = (_event, name) => handler(name);
    ipcRenderer.on("profile", listener);
    return () => ipcRenderer.removeListener("profile", listener);
  },
  openUrl(url) {
    ipcRenderer.send("open-url-request", url);
  },
  onOpenUrl(handler) {
    const listener = (_event, url) => handler(url);
    ipcRenderer.on("open-url", listener);
    return () => ipcRenderer.removeListener("open-url", listener);
  },
});
