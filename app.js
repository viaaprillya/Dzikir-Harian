const DATA_URL = "public/data/dzikir.json";
const SETTINGS_KEY = "dzikir_settings";
const PROGRESS_KEY = "dzikir_progress";
const HISTORY_KEY = "dzikir_history";
const STREAK_KEY = "dzikir_streak";

const defaults = {
  arabicFont: "Amiri",
  latinFont: "Inter",
  arabicSize: 34,
  latinSize: 16,
};

const state = {
  items: [],
  type: detectSession(),
  settings: readStorage(SETTINGS_KEY, defaults),
  progress: readStorage(PROGRESS_KEY, {}),
  history: readStorage(HISTORY_KEY, []),
  streak: readStorage(STREAK_KEY, 0),
  audio: null,
  search: "",
  pageIndex: 0,
};

const els = {
  currentDate: document.querySelector("#currentDate"),
  morningTab: document.querySelector("#morningTab"),
  eveningTab: document.querySelector("#eveningTab"),
  sessionHint: document.querySelector("#sessionHint"),
  progressRing: document.querySelector("#progressRing"),
  progressPercent: document.querySelector("#progressPercent"),
  countStat: document.querySelector("#countStat"),
  doneStat: document.querySelector("#doneStat"),
  streakStat: document.querySelector("#streakStat"),
  dzikirList: document.querySelector("#dzikirList"),
  template: document.querySelector("#dzikirTemplate"),
  searchInput: document.querySelector("#searchInput"),
  resetToday: document.querySelector("#resetToday"),
  previousDzikir: document.querySelector("#previousDzikir"),
  nextDzikir: document.querySelector("#nextDzikir"),
  pageIndicator: document.querySelector("#pageIndicator"),
  pageTitle: document.querySelector("#pageTitle"),
  drawer: document.querySelector("#settingsDrawer"),
  openSettings: document.querySelector("#openSettings"),
  closeSettings: document.querySelector("#closeSettings"),
  arabicFont: document.querySelector("#arabicFont"),
  latinFont: document.querySelector("#latinFont"),
  arabicSize: document.querySelector("#arabicSize"),
  latinSize: document.querySelector("#latinSize"),
  arabicSizeOut: document.querySelector("#arabicSizeOut"),
  latinSizeOut: document.querySelector("#latinSizeOut"),
  historyList: document.querySelector("#historyList"),
  historySummary: document.querySelector("#historySummary"),
};

init();

async function init() {
  applySettings();
  bindGlobalEvents();
  els.currentDate.textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  try {
    const response = await fetch(DATA_URL);
    state.items = await response.json();
    render();
  } catch (error) {
    state.items = Array.isArray(window.DZIKIR_DATA) ? window.DZIKIR_DATA : [];
    if (state.items.length) {
      render();
    } else {
      els.dzikirList.innerHTML = `<p class="empty">Data dzikir belum bisa dimuat.</p>`;
    }
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

function bindGlobalEvents() {
  [els.morningTab, els.eveningTab].forEach((button) => {
    button.addEventListener("click", () => {
      state.type = button.dataset.type;
      state.pageIndex = 0;
      render();
    });
  });

  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    state.pageIndex = 0;
    renderList();
  });

  els.previousDzikir.addEventListener("click", () => movePage(-1));
  els.nextDzikir.addEventListener("click", () => movePage(1));

  els.resetToday.addEventListener("click", () => {
    const key = progressKey();
    delete state.progress[key];
    persist(PROGRESS_KEY, state.progress);
    updateHistory();
    render();
  });

  els.openSettings.addEventListener("click", () => setDrawer(true));
  els.closeSettings.addEventListener("click", () => setDrawer(false));
  els.drawer.addEventListener("click", (event) => {
    if (event.target === els.drawer) setDrawer(false);
  });

  [
    ["arabicFont", els.arabicFont],
    ["latinFont", els.latinFont],
    ["arabicSize", els.arabicSize],
    ["latinSize", els.latinSize],
  ].forEach(([key, input]) => {
    input.addEventListener("input", () => {
      state.settings[key] = input.type === "range" ? Number(input.value) : input.value;
      persist(SETTINGS_KEY, state.settings);
      applySettings();
    });
  });
}

function render() {
  els.morningTab.classList.toggle("active", state.type === "morning");
  els.eveningTab.classList.toggle("active", state.type === "evening");
  els.sessionHint.textContent =
    state.type === "morning" ? "Otomatis aktif pukul 05:00 - 11:59" : "Otomatis aktif pukul 15:00 - 23:59";
  renderList();
  renderHistory();
}

function renderList() {
  const items = filteredItems();
  state.pageIndex = clamp(state.pageIndex, 0, Math.max(items.length - 1, 0));
  const item = items[state.pageIndex];

  els.dzikirList.innerHTML = "";
  if (item) {
    const card = els.template.content.firstElementChild.cloneNode(true);
    const itemState = getItemState(item);
    const done = itemState.count >= itemState.target;

    card.classList.toggle("done", done);
    card.querySelector(".card-order").textContent = `${state.type === "morning" ? "Pagi" : "Petang"} #${item.order}`;
    card.querySelector(".card-title").textContent = item.title;
    card.querySelector(".arabic").textContent = item.arabic || "Lafadz Arab belum tersedia.";
    card.querySelector(".latin").textContent = item.latin || "Latin belum tersedia.";
    card.querySelector(".translation").textContent = item.translation || "Terjemahan belum tersedia.";
    card.querySelector(".benefit").textContent = item.benefit || "";
    card.querySelector(".source").textContent = item.source;
    card.querySelector(".count-label").textContent = `${itemState.count} / ${itemState.target}`;
    card.querySelector(".target-input").value = itemState.target;
    card.querySelector(".complete-check").checked = done;

    card.querySelector(".minus").addEventListener("click", () => setCount(item, Math.max(0, itemState.count - 1)));
    card.querySelector(".plus").addEventListener("click", () => setCount(item, Math.min(itemState.target, itemState.count + 1)));
    card.querySelector(".target-input").addEventListener("change", (event) => {
      setTarget(item, Math.max(1, Number(event.target.value) || item.defaultCount));
    });
    card.querySelector(".complete-check").addEventListener("change", (event) => {
      setCount(item, event.target.checked ? itemState.target : 0);
    });
    bindAudio(card, item);
    els.dzikirList.append(card);
  }

  if (!item) {
    els.dzikirList.innerHTML = `<p class="empty">Tidak ada dzikir yang cocok dengan pencarian.</p>`;
  }

  renderPageNav(items);
  updateProgress();
}

function bindAudio(card, item) {
  const status = card.querySelector(".audio-status");
  const play = () => {
    if (state.audio) state.audio.pause();
    state.audio = new Audio(item.audio);
    state.audio.addEventListener("error", () => {
      status.textContent = "Audio belum tersedia di folder proyek.";
    });
    state.audio.addEventListener("ended", () => playNext());
    state.audio.play().then(() => {
      status.textContent = "Memutar audio";
    }).catch(() => {
      status.textContent = "Audio tidak bisa diputar.";
    });
  };

  card.querySelector(".play").addEventListener("click", play);
  card.querySelector(".pause").addEventListener("click", () => {
    if (state.audio) state.audio.pause();
    status.textContent = "Audio dijeda";
  });
  card.querySelector(".stop").addEventListener("click", () => {
    if (state.audio) {
      state.audio.pause();
      state.audio.currentTime = 0;
    }
    status.textContent = "Audio dihentikan";
  });
  card.querySelector(".rewind").addEventListener("click", () => seekAudio(-10));
  card.querySelector(".forward").addEventListener("click", () => seekAudio(10));
  card.querySelector(".next").addEventListener("click", () => playNext());
}

function playNext() {
  const items = filteredItems();
  const nextIndex = state.pageIndex + 1 >= items.length ? 0 : state.pageIndex + 1;
  const next = items[nextIndex];
  if (!next) return;
  state.pageIndex = nextIndex;
  renderList();
  state.audio?.pause();
  state.audio = new Audio(next.audio);
  state.audio.play().catch(() => {});
}

function movePage(direction) {
  const items = filteredItems();
  if (!items.length) return;
  state.audio?.pause();
  state.pageIndex = clamp(state.pageIndex + direction, 0, items.length - 1);
  renderList();
  const activeButton = direction > 0 ? els.nextDzikir : els.previousDzikir;
  activeButton.focus({ preventScroll: true });
}

function renderPageNav(items) {
  const total = items.length;
  const item = items[state.pageIndex];
  els.pageIndicator.textContent = total ? `${state.pageIndex + 1} / ${total}` : "0 / 0";
  els.pageTitle.textContent = item ? item.title : "Tidak ada dzikir";
  els.previousDzikir.disabled = state.pageIndex <= 0;
  els.nextDzikir.disabled = state.pageIndex >= total - 1;
}

function seekAudio(seconds) {
  if (!state.audio) return;
  state.audio.currentTime = Math.max(0, state.audio.currentTime + seconds);
}

function updateProgress() {
  const items = currentItems();
  const totalTarget = items.reduce((sum, item) => sum + getItemState(item).target, 0);
  const totalDone = items.reduce((sum, item) => sum + Math.min(getItemState(item).count, getItemState(item).target), 0);
  const doneItems = items.filter((item) => getItemState(item).count >= getItemState(item).target).length;
  const percent = totalTarget ? Math.round((totalDone / totalTarget) * 100) : 0;
  const degrees = Math.round((percent / 100) * 360);

  els.progressRing.style.background = `conic-gradient(var(--accent) ${degrees}deg, var(--border) ${degrees}deg)`;
  els.progressRing.setAttribute("aria-label", `Progress ${percent} persen`);
  els.progressPercent.textContent = `${percent}%`;
  els.countStat.textContent = `${totalDone} / ${totalTarget}`;
  els.doneStat.textContent = `${doneItems} / ${items.length}`;
  els.streakStat.textContent = `${state.streak} hari`;
}

function updateHistory() {
  const items = currentItems();
  const totalTarget = items.reduce((sum, item) => sum + getItemState(item).target, 0);
  const totalDone = items.reduce((sum, item) => sum + Math.min(getItemState(item).count, getItemState(item).target), 0);
  const doneItems = items.filter((item) => getItemState(item).count >= getItemState(item).target).length;
  const progress = totalTarget ? Math.round((totalDone / totalTarget) * 100) : 0;
  const date = today();
  const record = { date, type: state.type, progress, completed: doneItems, total: items.length };

  state.history = [record, ...state.history.filter((row) => !(row.date === date && row.type === state.type))].slice(0, 30);
  state.streak = calculateStreak(state.history);
  persist(HISTORY_KEY, state.history);
  persist(STREAK_KEY, state.streak);
}

function renderHistory() {
  els.historyList.innerHTML = "";
  els.historySummary.textContent = `${state.history.length} catatan`;
  state.history.slice(0, 8).forEach((row) => {
    const div = document.createElement("div");
    div.className = "history-row";
    div.innerHTML = `
      <strong>${formatDate(row.date)} · ${row.type === "morning" ? "Pagi" : "Petang"}</strong>
      <span>${row.completed}/${row.total} selesai</span>
      <span>${row.progress}%</span>
    `;
    els.historyList.append(div);
  });
  if (!state.history.length) {
    els.historyList.innerHTML = `<p>Riwayat akan muncul setelah progress berubah.</p>`;
  }
}

function currentItems() {
  return state.items.filter((item) => item.type === state.type).sort((a, b) => a.order - b.order);
}

function filteredItems() {
  const query = state.search;
  return currentItems().filter((item) => {
    if (!query) return true;
    return [item.title, item.source, item.benefit, item.translation, item.latin]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function getItemState(item) {
  const day = state.progress[progressKey()] || { counts: {}, targets: {} };
  return {
    count: Number(day.counts?.[item.id] || 0),
    target: Number(day.targets?.[item.id] || item.defaultCount || 1),
  };
}

function setCount(item, count) {
  const key = progressKey();
  state.progress[key] ||= { counts: {}, targets: {} };
  state.progress[key].counts[item.id] = count;
  persist(PROGRESS_KEY, state.progress);
  updateHistory();
  renderList();
  renderHistory();
}

function setTarget(item, target) {
  const key = progressKey();
  state.progress[key] ||= { counts: {}, targets: {} };
  state.progress[key].targets[item.id] = target;
  state.progress[key].counts[item.id] = Math.min(getItemState(item).count, target);
  persist(PROGRESS_KEY, state.progress);
  updateHistory();
  renderList();
  renderHistory();
}

function applySettings() {
  const settings = { ...defaults, ...state.settings };
  document.documentElement.style.setProperty("--arabic-font", `"${settings.arabicFont}"`);
  document.documentElement.style.setProperty("--latin-font", `"${settings.latinFont}"`);
  document.documentElement.style.setProperty("--arabic-size", `${settings.arabicSize}px`);
  document.documentElement.style.setProperty("--latin-size", `${settings.latinSize}px`);
  els.arabicFont.value = settings.arabicFont;
  els.latinFont.value = settings.latinFont;
  els.arabicSize.value = settings.arabicSize;
  els.latinSize.value = settings.latinSize;
  els.arabicSizeOut.textContent = `${settings.arabicSize}px`;
  els.latinSizeOut.textContent = `${settings.latinSize}px`;
}

function setDrawer(open) {
  els.drawer.classList.toggle("open", open);
  els.drawer.setAttribute("aria-hidden", String(!open));
}

function detectSession() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 15 && hour < 24) return "evening";
  return "morning";
}

function progressKey() {
  return `${today()}_${state.type}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function calculateStreak(history) {
  let streak = 0;
  const fullDays = new Set(history.filter((row) => row.progress === 100).map((row) => row.date));
  const date = new Date();
  for (;;) {
    const key = date.toISOString().slice(0, 10);
    if (!fullDays.has(key)) break;
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
