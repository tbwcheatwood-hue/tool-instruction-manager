const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  session,
  screen,
} = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// NVIDIA + GNOME Wayland restarts Electron's GPU process in a loop.
// XWayland is the path that actually composites these panel windows.
const ozone = process.env.OVERLAY_OZONE || (process.env.XDG_SESSION_TYPE === "wayland" ? "x11" : "");
if (ozone) app.commandLine.appendSwitch("ozone-platform", ozone);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setName("Game Overlay");

const selfPid = process.pid;
const IGNORE_PROCESS = /steam(webhelper)?|steam-runtime|pressure-vessel|pv-adverb|reaper|gamescope|explorer\.exe|steam\.exe|wineserver|GameOverlay/i;

let wins = {};
let tray = null;
let clickThrough = false;
let currentGame = "Desktop";
let queueOpen = false;
let latestState = null;

function profileDir() {
  const dir = path.join(app.getPath("userData"), "games");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slug(name) {
  const clean = String(name || "Desktop")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return clean || "Desktop";
}

function profilePath(name) {
  return path.join(profileDir(), `${slug(name)}.json`);
}

function readCmdline(pid) {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`).toString("utf8").replace(/\0/g, " ");
  } catch {
    return "";
  }
}

function detectSteamGame() {
  let found = null;
  let entries = [];
  try {
    entries = fs.readdirSync("/proc");
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === selfPid) continue;
    const cmd = readCmdline(pid);
    if (!cmd) continue;
    const match = cmd.match(/steamapps\/common\/([^/\s]+)/i);
    if (!match) continue;
    const name = match[1].replace(/_/g, " ");
    if (IGNORE_PROCESS.test(name) || IGNORE_PROCESS.test(cmd.split(" ")[0] || "")) continue;
    if (!found || pid > found.pid) found = { pid, name };
  }
  return found ? found.name : null;
}

function activeArea() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
}

function paintOpacity(win, amount) {
  if (!win || win.isDestroyed() || process.platform !== "linux") return;
  const handle = win.getNativeWindowHandle();
  const id = handle.readUInt32LE(0);
  const value = Math.round(Math.min(1, Math.max(0.2, amount)) * 0xffffffff);
  execFile(
    "xprop",
    ["-id", String(id), "-f", "_NET_WM_WINDOW_OPACITY", "32c", "-set", "_NET_WM_WINDOW_OPACITY", String(value)],
    () => {},
  );
}

function layout() {
  const b = activeArea();
  const guideW = Math.round(b.width * 0.27);
  const browserW = Math.round(b.width * 0.42);
  const dockW = Math.min(Math.round(b.width * 0.25), 460);
  const playerH = queueOpen ? 252 : 80;
  const place = {
    guide: { x: b.x + 10, y: b.y + 10, width: guideW, height: b.height - 20 },
    browser: { x: b.x + b.width - browserW - 10, y: b.y + 10, width: browserW, height: b.height - 112 },
    player: { x: b.x + b.width - 330, y: b.y + b.height - playerH - 10, width: 320, height: playerH },
    dockLeft: { x: b.x + 10, y: b.y + 10, width: dockW, height: 108 },
    dockRight: { x: b.x + b.width - dockW - 10, y: b.y + 10, width: dockW, height: 124 },
  };
  for (const [name, bounds] of Object.entries(place)) {
    const win = wins[name];
    if (!win || win.isDestroyed()) continue;
    win.setBounds(bounds);
  }
}

function applyChrome(state) {
  clickThrough = !!state.clickThrough;
  queueOpen = !!state.queueOpen;
  layout();
  const shown = {
    guide: !!state.guideOpen,
    browser: !!state.browserOpen,
    player: !!state.musicOpen,
    dockLeft: !state.guideOpen,
    dockRight: !state.browserOpen || !state.musicOpen,
  };
  for (const [name, win] of Object.entries(wins)) {
    if (!win || win.isDestroyed()) continue;
    paintOpacity(win, name.startsWith("dock") ? 0.58 : 0.9);
    win.setIgnoreMouseEvents(clickThrough);
    win.setFocusable(!clickThrough);
    if (shown[name]) {
      if (!win.isVisible()) win.showInactive();
    } else if (win.isVisible()) win.hide();
  }
}

function createWindow(name) {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#0f1115",
    alwaysOnTop: true,
    fullscreenable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    skipTaskbar: name !== "guide",
    title: "Game Overlay",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: name === "browser" || name === "player",
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) console.log(`PAGE ${name} ${message}`);
  });
  win.webContents.on("did-finish-load", () => {
    if (latestState) win.webContents.send("state", latestState);
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"), { query: { panel: name } });
  return win;
}

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (contents.getType() === "webview" && wins.browser && /^https?:/i.test(url)) {
      wins.browser.webContents.send("open-url", url);
    }
    return { action: "deny" };
  });
  if (contents.getType() === "webview") {
    contents.setBackgroundThrottling(false);
    contents.on("will-navigate", (event, url) => {
      if (!/^https?:|^file:/i.test(url)) event.preventDefault();
    });
  }
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "clipboard-sanitized-write");
  });
  const overlaySession = session.fromPartition("persist:overlay");
  overlaySession.setUserAgent(CHROME_UA);
  overlaySession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "clipboard-sanitized-write");
  });

  for (const name of ["guide", "browser", "player", "dockLeft", "dockRight"]) {
    wins[name] = createWindow(name);
    wins[name].webContents.on("will-attach-webview", (_event, prefs) => {
      delete prefs.preload;
      prefs.nodeIntegration = false;
      prefs.contextIsolation = true;
      prefs.sandbox = true;
    });
  }
  layout();
  wins.guide.showInactive();
  wins.browser.showInactive();
  wins.player.showInactive();
  setTimeout(() => {
    paintOpacity(wins.guide, 0.9);
    paintOpacity(wins.browser, 0.9);
    paintOpacity(wins.player, 0.9);
  }, 400);

  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  tray = new Tray(icon);
  tray.setToolTip("Game Overlay");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show panels", click: () => wins.guide?.webContents.send("toggle-active") },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );

  for (const [accelerator, action] of [
    ["Shift+Tab", () => wins.guide?.webContents.send("toggle-active")],
    ["Alt+Up", () => wins.guide?.webContents.send("guide-scroll", -1)],
    ["Alt+Down", () => wins.guide?.webContents.send("guide-scroll", 1)],
    ["Control+Shift+Q", () => app.quit()],
  ]) {
    const ok = globalShortcut.register(accelerator, action);
    if (!ok) console.log(`HOTKEY_FAIL ${accelerator}`);
  }

  currentGame = detectSteamGame() || "Desktop";
  const announce = () => {
    for (const win of Object.values(wins)) {
      if (!win.isDestroyed()) win.webContents.send("profile", currentGame);
    }
  };
  wins.guide.webContents.once("did-finish-load", announce);
  setInterval(() => {
    const next = detectSteamGame() || "Desktop";
    if (next !== currentGame) {
      currentGame = next;
      announce();
    }
  }, 3000);

  screen.on("display-metrics-changed", layout);

  if (process.env.OVERLAY_CHECK === "1") {
    setTimeout(async () => {
      try {
        const guide = wins.guide;
        const info = await guide.webContents.executeJavaScript(
          `({ panel: document.body.dataset.panel, err: window.__err || "", title: (document.getElementById("guide-title")||{}).value || "", text: document.body.innerText.slice(0,180), bg: getComputedStyle(document.body).backgroundColor })`,
        );
        console.log(
          "VIS",
          JSON.stringify(Object.fromEntries(Object.entries(wins).map(([name, win]) => [name, win.isVisible()]))),
        );
        console.log("DOM", JSON.stringify(info));
        const display = screen.getPrimaryDisplay();
        console.log("DISPLAY", JSON.stringify({ bounds: display.bounds, work: display.workArea }));
        guide.setOpacity(0.9);
        console.log("GUIDE_BOUNDS", JSON.stringify(guide.getBounds()), "OPACITY", guide.getOpacity());
        const image = await Promise.race([
          guide.webContents.capturePage(),
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error("capture-timeout")), 4000)),
        ]);
        const out = path.join(__dirname, "overlay-check.png");
        fs.writeFileSync(out, image.toPNG());
        console.log(`CAPTURE ${image.getSize().width}x${image.getSize().height}`);
      } catch (error) {
        console.log("CAPTURE_FAIL", error.message);
      }
      app.quit();
    }, 2500);
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});

ipcMain.on("open-url-request", (_event, url) => {
  if (typeof url === "string" && /^https?:/i.test(url)) wins.browser?.webContents.send("open-url", url);
});

ipcMain.handle("pull-state", () => latestState);

ipcMain.on("publish", (event, data) => {
  if (data && typeof data === "object") {
    latestState = data;
    applyChrome(data);
  }
  for (const win of Object.values(wins)) {
    if (!win.isDestroyed() && win.webContents.id !== event.sender.id) {
      win.webContents.send("state", data);
    }
  }
});

ipcMain.on("music", (_event, command) => {
  wins.player?.webContents.send("music", command);
});

ipcMain.on("set-interactive", () => {});

ipcMain.handle("get-profile", () => currentGame);

ipcMain.handle("load-profile", (_event, name) => {
  try {
    return JSON.parse(fs.readFileSync(profilePath(name), "utf8"));
  } catch {
    return null;
  }
});

ipcMain.handle("save-profile", (_event, name, data) => {
  fs.writeFileSync(profilePath(name), JSON.stringify(data, null, 2));
  return true;
});
