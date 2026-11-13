window.addEventListener("error", (event) => {
  window.__err = String(event.message || event.error);
});
const $ = (id) => document.getElementById(id);
const panel = new URLSearchParams(window.location.search).get("panel") || "guide";
document.body.dataset.panel = panel;

const START_URL = new URL("start.html", window.location.href).href;
const FALLBACK_ART =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" rx="6" fill="#1a1e24"/><circle cx="30" cy="30" r="12" fill="none" stroke="#9AA0A6" stroke-width="1.5"/><circle cx="30" cy="30" r="3" fill="#4EC5D3"/></svg>',
  );

const defaultGuide = () => ({
  title: "Guide to the Northern Pass",
  checks: [
    { text: "Find the hidden cave", done: false },
    { text: "Collect 3 silver coins", done: false },
  ],
  notes: [
    "The northern pass narrows after the stone bridge. Keep the ridge on your left and watch for cairns half buried in moss.",
    "The cave mouth sits under the second overhang. Three silver coins are in the alcove past the collapsed stair.",
  ],
});

const state = {
  profile: "Desktop",
  clickThrough: false,
  guideOpen: true,
  browserOpen: true,
  musicOpen: true,
  volume: 0.8,
  scrollTop: 0,
  guide: defaultGuide(),
  tabs: [{ url: START_URL, title: "New tab", favicon: "" }],
  activeTab: 0,
  queueOpen: false,
  track: { title: "YouTube Music", artist: "Not playing", playing: false, img: "" },
};

let saveTimer = 0;
let applying = false;
let paintingTabs = false;
let tabsDirty = false;
let pointerHot = false;
let lastToggle = 0;
let remote = false;
let tabsDrawn = false;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (remote) return;
    saveNow();
    window.overlay.publish(snapshot());
  }, 120);
}

function snapshot() {
  state.scrollTop = $("reader").scrollTop;
  return {
    clickThrough: state.clickThrough,
    guideOpen: state.guideOpen,
    browserOpen: state.browserOpen,
    musicOpen: state.musicOpen,
    volume: state.volume,
    scrollTop: state.scrollTop,
    guide: state.guide,
    tabs: state.tabs,
    activeTab: state.activeTab,
    queueOpen: state.queueOpen,
    track: state.track,
    profile: state.profile,
  };
}

function saveNow() {
  window.overlay.saveProfile(state.profile, snapshot());
}

function syncChrome() {
  const expanded = state.guideOpen || state.browserOpen || state.musicOpen;
  document.body.classList.toggle("music-open", state.musicOpen);
  if (!remote) window.overlay.publish(snapshot());
  $("guide").hidden = !state.guideOpen;
  $("browser").hidden = !state.browserOpen;
  $("player").hidden = !state.musicOpen;
  if (!state.musicOpen) state.queueOpen = false;
  $("queue").hidden = !state.queueOpen || !state.musicOpen;
  $("dock-left").hidden = state.guideOpen;
  $("dock-right").hidden = state.browserOpen && state.musicOpen;
  $("dock-track").parentElement.parentElement.hidden = state.musicOpen;
  $("dock-tabs").parentElement.hidden = state.browserOpen;
  $("dock-right").querySelector(".dock-cues").hidden = state.browserOpen;
  const pressed = state.clickThrough ? "true" : "false";
  $("click-through").setAttribute("aria-pressed", pressed);
  $("click-through-dock").setAttribute("aria-pressed", pressed);
  $("queue-toggle").setAttribute("aria-expanded", state.queueOpen ? "true" : "false");
}

function renderGuide() {
  const query = $("guide-search").value.trim().toLowerCase();
  $("guide-title").value = state.guide.title;
  $("dock-guide-title").textContent = state.guide.title;
  const openItem = state.guide.checks.find((item) => !item.done) || state.guide.checks[0];
  $("dock-check").textContent = openItem ? openItem.text : "";

  const list = $("checks");
  list.innerHTML = "";
  state.guide.checks.forEach((item, index) => {
    const li = document.createElement("li");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = item.done;
    box.addEventListener("change", () => {
      state.guide.checks[index].done = box.checked;
      renderGuide();
      scheduleSave();
    });
    const text = document.createElement("input");
    text.className = "check-text";
    text.value = item.text;
    text.setAttribute("aria-label", "Checklist item");
    text.addEventListener("input", () => {
      state.guide.checks[index].text = text.value;
      $("dock-check").textContent = (state.guide.checks.find((entry) => !entry.done) || text).text || text.value;
      scheduleSave();
    });
    if (query && !item.text.toLowerCase().includes(query)) li.classList.add("dim");
    li.append(box, text);
    list.append(li);
  });

  const notes = $("notes");
  notes.innerHTML = "";
  state.guide.notes.forEach((note, index) => {
    const area = document.createElement("textarea");
    area.className = "note";
    area.value = note;
    area.rows = Math.max(3, Math.ceil(note.length / 58));
    fitNote(area);
    area.addEventListener("input", () => {
      state.guide.notes[index] = area.value;
      fitNote(area);
      scheduleSave();
    });
    if (query && !note.toLowerCase().includes(query)) area.classList.add("dim");
    notes.append(area);
  });
}

function fitNote(area) {
  area.style.height = "auto";
  const height = Math.max(area.scrollHeight, area.rows * 21);
  area.style.height = `${height}px`;
}

function normalizeUrl(raw) {
  const value = raw.trim();
  if (!value) return START_URL;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value)) return `https://${value}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

function renderTabs() {
  if (paintingTabs) {
    tabsDirty = true;
    return;
  }
  paintingTabs = true;
  const nav = $("tabs");
  nav.innerHTML = "";
  const min = document.createElement("button");
  min.className = "icon-btn";
  min.type = "button";
  min.setAttribute("aria-label", "Minimize browser");
  min.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8h10"/></svg>';
  min.addEventListener("click", () => {
    state.browserOpen = false;
    syncChrome();
    scheduleSave();
  });
  nav.append(min);

  state.tabs.forEach((tab, index) => {
    const button = document.createElement("button");
    button.className = "tab";
    button.type = "button";
    button.setAttribute("aria-selected", index === state.activeTab ? "true" : "false");
    button.title = tab.title || tab.url;
    const img = document.createElement("img");
    img.alt = "";
    img.src = tab.favicon || FALLBACK_ART;
    button.append(img);
    if (state.tabs.length > 1) {
      const close = document.createElement("span");
      close.className = "tab-x";
      close.textContent = "×";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(index);
      });
      button.append(close);
    }
    button.addEventListener("click", () => activateTab(index));
    nav.append(button);
  });

  const add = document.createElement("button");
  add.className = "tab-add";
  add.type = "button";
  add.setAttribute("aria-label", "New tab");
  add.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 2v10M2 7h10"/></svg>';
  add.addEventListener("click", () => {
    state.tabs.push({ url: START_URL, title: "New tab", favicon: "" });
    activateTab(state.tabs.length - 1);
    $("urlbar").classList.add("pinned");
    $("url-input").focus();
  });
  nav.append(add);

  const dock = $("dock-tabs");
  dock.innerHTML = "";
  state.tabs.slice(0, 5).forEach((tab, index) => {
    const img = document.createElement("img");
    img.alt = tab.title || "Tab";
    img.src = tab.favicon || FALLBACK_ART;
    img.title = tab.title || tab.url;
    img.addEventListener("click", (event) => {
      event.stopPropagation();
      state.browserOpen = true;
      activateTab(index);
      syncChrome();
      scheduleSave();
    });
    dock.append(img);
  });

  const active = state.tabs[state.activeTab];
  if (active && document.activeElement !== $("url-input")) {
    $("url-input").value = active.url.startsWith("file:") ? "" : active.url;
  }
  ensureWebviews();
  paintingTabs = false;
  if (tabsDirty) {
    tabsDirty = false;
    renderTabs();
  }
}

function ensureWebviews() {
  if (panel !== "browser") return;
  const frame = $("wv-frame");
  const existing = new Map([...frame.querySelectorAll("webview")].map((node) => [node.dataset.index, node]));
  state.tabs.forEach((tab, index) => {
    let view = existing.get(String(index));
    if (!view) {
      view = document.createElement("webview");
      view.setAttribute("partition", "persist:overlay");
      view.dataset.index = String(index);
      view.src = tab.url;
      view.addEventListener("page-title-updated", (event) => {
        state.tabs[index].title = event.title || state.tabs[index].title;
        renderTabs();
        scheduleSave();
      });
      view.addEventListener("page-favicon-updated", (event) => {
        const favicon = event.favicons && event.favicons[0];
        if (!favicon) return;
        state.tabs[index].favicon = favicon;
        renderTabs();
        scheduleSave();
      });
      view.addEventListener("did-navigate", (event) => onNavigate(index, event.url));
      view.addEventListener("did-navigate-in-page", (event) => onNavigate(index, event.url));
      frame.append(view);
    }
    view.classList.toggle("off", index !== state.activeTab);
    existing.delete(String(index));
  });
  existing.forEach((node) => node.remove());
}

function onNavigate(index, url) {
  if (!url || url === state.tabs[index].url) return;
  state.tabs[index].url = url;
  if (index === state.activeTab && document.activeElement !== $("url-input")) $("url-input").value = url;
  scheduleSave();
}

function activateTab(index) {
  state.activeTab = index;
  $("urlbar").classList.remove("pinned");
  renderTabs();
  scheduleSave();
}

function closeTab(index) {
  const frame = $("wv-frame");
  frame.innerHTML = "";
  state.tabs.splice(index, 1);
  if (!state.tabs.length) state.tabs.push({ url: START_URL, title: "New tab", favicon: "" });
  state.activeTab = Math.max(0, Math.min(state.activeTab, state.tabs.length - 1));
  renderTabs();
  scheduleSave();
}

function openInBrowser(url) {
  state.browserOpen = true;
  state.tabs.push({ url, title: "Tab", favicon: "" });
  activateTab(state.tabs.length - 1);
  syncChrome();
}

const playSvg = '<svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor"><path d="M6 4.2v9.6l8-4.8-8-4.8z"/></svg>';
const pauseSvg = '<svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor"><path d="M5 3.5h2.6v11H5zM10.4 3.5H13v11h-2.6z"/></svg>';

function setPlaying(playing) {
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");
  $("play").innerHTML = playing ? pauseSvg : playSvg;
  $("play").setAttribute("aria-pressed", playing ? "true" : "false");
  for (const id of ["dock-play-left", "dock-play-right"]) {
    $(id).innerHTML = playing ? pauseSvg : playSvg;
    $(id).setAttribute("aria-label", playing ? "Pause" : "Play");
  }
}

async function musicEval(script) {
  const guest = $("music-guest");
  if (!guest || !guest.executeJavaScript) return null;
  try {
    return await guest.executeJavaScript(script, false);
  } catch {
    return null;
  }
}

async function refreshMusic() {
  const info = await musicEval(`(() => {
    const title = document.querySelector("ytmusic-player-bar .title")?.textContent?.trim() || "";
    const artist = document.querySelector("ytmusic-player-bar .byline")?.innerText?.trim() || "";
    const button = document.querySelector("#play-pause-button");
    const label = (button?.getAttribute("aria-label") || "").toLowerCase();
    const img = document.querySelector("ytmusic-player-bar img")?.src || "";
    const items = [...document.querySelectorAll("ytmusic-player-queue-item .song-title, ytmusic-playlist-panel-item .title")]
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .slice(0, 4);
    return { title, artist, playing: label.includes("pause"), img, items };
  })()`);
  if (!info) return;
  const next = {
    title: info.title || "YouTube Music",
    artist: info.artist || (info.title ? "" : "Not playing"),
    playing: !!info.playing,
    img: info.img || "",
  };
  const changed = JSON.stringify(next) !== JSON.stringify(state.track);
  state.track = next;
  paintTrack();
  if (state.queueOpen) {
    const queue = $("queue");
    queue.innerHTML = "";
    const rows = info.items.length ? info.items : ["Nothing queued"];
    rows.forEach((text) => {
      const row = document.createElement("div");
      row.className = "queue-item";
      row.textContent = text;
      queue.append(row);
    });
  }
  if (changed && !remote) window.overlay.publish(snapshot());
}

function togglePlay() {
  musicEval(`document.querySelector("#play-pause-button")?.click()`);
  setTimeout(refreshMusic, 400);
}

function hitInteractive(event) {
  const hit = !!(event.target instanceof Element && event.target.closest("[data-hit]"));
  if (hit === pointerHot) return;
  pointerHot = hit;
  window.overlay.setInteractive(hit);
}

function applyProfile(data) {
  applying = true;
  const next = data || {};
  state.clickThrough = !!next.clickThrough;
  state.guideOpen = next.guideOpen !== false;
  state.browserOpen = next.browserOpen !== false;
  state.musicOpen = next.musicOpen !== false;
  state.volume = typeof next.volume === "number" ? next.volume : 0.8;
  state.scrollTop = next.scrollTop || 0;
  state.guide = next.guide && next.guide.title ? next.guide : defaultGuide();
  state.tabs = Array.isArray(next.tabs) && next.tabs.length ? next.tabs : [{ url: START_URL, title: "New tab", favicon: "" }];
  state.activeTab = Math.min(next.activeTab || 0, state.tabs.length - 1);
  $("volume").value = String(state.volume);
  $("wv-frame").innerHTML = "";
  $("profile-guide").textContent = state.profile;
  $("profile-dock").textContent = state.profile;
  renderGuide();
  renderTabs();
  syncChrome();
  requestAnimationFrame(() => {
    $("reader").scrollTop = state.scrollTop;
    applying = false;
  });
}

async function switchProfile(name) {
  if (!name || name === state.profile) return;
  saveNow();
  state.profile = name;
  const saved = await window.overlay.loadProfile(name);
  applyProfile(saved);
}

$("guide-title").addEventListener("input", () => {
  state.guide.title = $("guide-title").value;
  $("dock-guide-title").textContent = state.guide.title;
  scheduleSave();
});
$("guide-search").addEventListener("input", renderGuide);
$("add-check").addEventListener("click", () => {
  state.guide.checks.push({ text: "New step", done: false });
  renderGuide();
  scheduleSave();
});
$("add-note").addEventListener("click", () => {
  state.guide.notes.push("");
  renderGuide();
  const areas = $("notes").querySelectorAll("textarea");
  areas[areas.length - 1]?.focus();
  scheduleSave();
});
$("guide-min").addEventListener("click", () => {
  state.guideOpen = false;
  syncChrome();
  scheduleSave();
});
$("reader").addEventListener("scroll", () => {
  if (!applying) scheduleSave();
});

$("urlbar").addEventListener("submit", (event) => {
  event.preventDefault();
  const url = normalizeUrl($("url-input").value);
  const view = $("wv-frame").querySelector(`webview[data-index="${state.activeTab}"]`);
  state.tabs[state.activeTab].url = url;
  if (view) view.src = url;
  $("urlbar").classList.remove("pinned");
  scheduleSave();
});

function setClickThrough(on) {
  state.clickThrough = on;
  syncChrome();
  scheduleSave();
}
$("click-through").addEventListener("click", () => setClickThrough(!state.clickThrough));
$("click-through-dock").addEventListener("click", (event) => {
  event.stopPropagation();
  setClickThrough(!state.clickThrough);
});

$("play").addEventListener("click", togglePlay);
function requestPlay(event) {
  event.stopPropagation();
  if (panel === "player") togglePlay();
  else window.overlay.music("toggle");
}
$("dock-play-left").addEventListener("click", requestPlay);
$("dock-play-right").addEventListener("click", requestPlay);
$("next").addEventListener("click", () => {
  musicEval(`(document.querySelector("#next-button") || document.querySelector(".next-button"))?.click()`);
  setTimeout(refreshMusic, 700);
});
$("volume").addEventListener("input", () => {
  state.volume = Number($("volume").value);
  musicEval(`(() => { const video = document.querySelector("video"); if (video) video.volume = ${state.volume}; })()`);
  scheduleSave();
});
$("queue-toggle").addEventListener("click", () => {
  state.queueOpen = !state.queueOpen;
  syncChrome();
  refreshMusic();
});
$("art-btn").addEventListener("click", () => {
  if (state.track.title === "YouTube Music") window.overlay.openUrl("https://music.youtube.com/");
});

$("dock-left").addEventListener("click", (event) => {
  if (event.target.closest("[data-action]")) return;
  state.guideOpen = true;
  syncChrome();
  scheduleSave();
});
$("dock-right").addEventListener("click", (event) => {
  if (event.target.closest("[data-action], img, .mini-tabs")) return;
  const row = event.target.closest(".dock-row");
  if (row && row.querySelector("#dock-track")) state.musicOpen = true;
  else if (!state.browserOpen) state.browserOpen = true;
  else state.musicOpen = true;
  syncChrome();
  scheduleSave();
});
$("music-min").addEventListener("click", () => {
  state.musicOpen = false;
  syncChrome();
  scheduleSave();
});

window.addEventListener("mousemove", hitInteractive);
window.addEventListener("mousedown", hitInteractive);

function toggleActive() {
  const now = Date.now();
  if (now - lastToggle < 250) return;
  lastToggle = now;
  const anyOpen = state.guideOpen || state.browserOpen || state.musicOpen;
  if (anyOpen && !state.clickThrough) {
    state.guideOpen = false;
    state.browserOpen = false;
    state.musicOpen = false;
  } else {
    state.clickThrough = false;
    state.guideOpen = true;
    state.browserOpen = true;
    state.musicOpen = true;
  }
  syncChrome();
  scheduleSave();
}

if (panel === "guide") window.overlay.onToggleActive(toggleActive);

window.overlay.onGuideScroll((direction) => {
  if (panel !== "guide") return;
  $("reader").scrollBy({ top: direction * 80, behavior: "smooth" });
  scheduleSave();
});

window.overlay.onProfile((name) => {
  if (panel === "guide") switchProfile(name);
});

if (panel === "browser") window.overlay.onOpenUrl((url) => openInBrowser(url));

function paintTrack() {
  $("track-title").textContent = state.track.title || "YouTube Music";
  $("dock-track").textContent = state.track.title || "YouTube Music";
  $("track-by").textContent = state.track.artist || "";
  $("art").src = state.track.img || FALLBACK_ART;
  setPlaying(!!state.track.playing);
}

function applyRemote(data) {
  if (!data || typeof data !== "object") return;
  remote = true;
  state.clickThrough = !!data.clickThrough;
  state.guideOpen = data.guideOpen !== false;
  state.browserOpen = data.browserOpen !== false;
  state.musicOpen = data.musicOpen !== false;
  state.queueOpen = !!data.queueOpen;
  state.volume = typeof data.volume === "number" ? data.volume : state.volume;
  state.scrollTop = data.scrollTop || 0;
  if (data.profile) state.profile = data.profile;
  if (data.guide && data.guide.title) state.guide = data.guide;
  if (data.track) state.track = data.track;
  const nextTabs = Array.isArray(data.tabs) && data.tabs.length ? data.tabs : state.tabs;
  const tabsSame = JSON.stringify(nextTabs) === JSON.stringify(state.tabs) && data.activeTab === state.activeTab;
  state.tabs = nextTabs;
  state.activeTab = Math.min(data.activeTab || 0, state.tabs.length - 1);
  $("volume").value = String(state.volume);
  $("profile-guide").textContent = state.profile;
  $("profile-dock").textContent = state.profile;
  renderGuide();
  if (!tabsSame || !tabsDrawn) {
    if (panel === "browser" && tabsDrawn && !tabsSame) $("wv-frame").innerHTML = "";
    renderTabs();
    tabsDrawn = true;
  }
  paintTrack();
  syncChrome();
  if (panel === "guide") $("reader").scrollTop = state.scrollTop;
  remote = false;
}

window.overlay.onState(applyRemote);
paintTrack();

if (panel === "player") {
  const guest = $("music-guest");
  guest.src = "https://music.youtube.com/";
  guest.addEventListener("dom-ready", () => {
    musicEval(`(() => { const video = document.querySelector("video"); if (video) video.volume = ${state.volume}; })()`);
    refreshMusic();
  });
  setInterval(refreshMusic, 2000);
  window.overlay.onMusic((command) => {
    if (command === "toggle") togglePlay();
    if (command === "next") $("next").click();
  });
}

async function waitForState() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const existing = await window.overlay.pull();
    if (existing) {
      applyRemote(existing);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

if (panel === "guide") {
  window.overlay.pull().then(async (existing) => {
    if (existing) {
      applyRemote(existing);
      return;
    }
    state.profile = (await window.overlay.getProfile()) || "Desktop";
    applyProfile(await window.overlay.loadProfile(state.profile));
  });
} else {
  waitForState();
}
