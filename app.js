import { resolveGameUrl, getAdsForSlot } from './portal-lib.mjs';

const elements = {
  status: document.querySelector("#catalog-status"),
  catalog: document.querySelector("#catalog"),
  search: document.querySelector("#search"),
  reload: document.querySelector("#reload"),
  tagline: document.querySelector("#tagline"),
  publish: document.querySelector("#publish-link"),
  footerPublish: document.querySelector("#footer-publish"),
  headerAd: document.querySelector("#header-ad"),
  searchAd: document.querySelector("#search-ad"),
  gameTemplate: document.querySelector("#game-card-template"),
  adTemplate: document.querySelector("#card-ad-template"),
};

const COPY = {
  "zh-Hans": {
    tagline: "请务必收藏发布页，回家不迷路",
    searchPlaceholder: "搜索标题、作者或仓库名",
    loading: "正在读取游戏目录…",
    loaded: (count) => `共 ${count} 个游戏。`,
    matched: (count) => `找到 ${count} 个匹配游戏。`,
    empty: "暂时没有符合条件的游戏。",
    error: "目录暂时无法加载，请稍后重试。",
    play: "开始",
    source: "源码",
    acquire: "获取",
  },
  en: {
    tagline: "Bookmark the permanent release page",
    searchPlaceholder: "Search title, author, or repository",
    loading: "Loading game catalog…",
    loaded: (count) => `${count} playable games loaded.`,
    matched: (count) => `${count} matching games found.`,
    empty: "No matching games are available.",
    error: "The catalog is temporarily unavailable.",
    play: "Play",
    source: "Source",
    acquire: "Get",
  },
  ja: {
    tagline: "恒久公開ページをブックマークしてください",
    searchPlaceholder: "タイトル・作者・リポジトリを検索",
    loading: "ゲーム一覧を読み込み中…",
    loaded: (count) => `${count} 本のゲームを読み込みました。`,
    matched: (count) => `${count} 本のゲームが見つかりました。`,
    empty: "一致するゲームはありません。",
    error: "ゲーム一覧を読み込めませんでした。",
    play: "開始",
    source: "ソース",
    acquire: "取得",
  },
};

const state = {
  config: {},
  ads: { ads: [], slots: {} },
  games: [],
  language: getInitialLanguage(),
  loading: false,
  filtered: [],
  rendered: 0,
  nextAdAt: 0,
  adIndex: 0,
};

initializeUi();
loadData();

function initializeUi() {
  elements.search.addEventListener("input", render);
  elements.reload.addEventListener("click", loadData);
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.language));
  });
  document.addEventListener("click", trackClick);
  applyLanguage();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) appendBatch();
    }, { rootMargin: '600px' });
    observer.observe(document.querySelector('#load-sentinel'));
  }
  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 700) appendBatch();
  }, { passive: true });
}

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  elements.reload.classList.add("is-loading");
  setStatus(copy().loading);

  try {
    const localConfig = await fetchJson("/config.json");
    state.config = await loadRuntimeConfig(localConfig);
    const [catalog, ads] = await Promise.all([
      fetchFirstAvailable(state.config.catalogEndpoints),
      fetchFirstAvailable(state.config.adsEndpoints || ["/ads.json"]).catch(() => ({ enabled: false, ads: [], slots: {} })),
    ]);

    state.ads = normalizeAds(ads);
    state.games = normalizeGames(catalog, state.config);
    applyConfig();
    renderAdSlot(elements.headerAd, "header");
    renderAdSlot(elements.searchAd, "search");
    render();
    sendEvent("page_view", { gameCount: state.games.length });
  } catch (error) {
    console.error("Failed to load portal data", error);
    elements.catalog.replaceChildren(createStateCard(copy().error));
    setStatus(copy().error, true);
  } finally {
    state.loading = false;
    elements.reload.classList.remove("is-loading");
  }
}

async function loadRuntimeConfig(localConfig) {
  const endpoints = Array.isArray(localConfig.runtimeConfigEndpoints)
    ? localConfig.runtimeConfigEndpoints
    : [];

  for (const endpoint of endpoints) {
    try {
      const remote = await fetchJson(endpoint, 4000);
      return mergeConfig(localConfig, remote);
    } catch (error) {
      console.warn(`Runtime config unavailable: ${endpoint}`, error);
    }
  }
  return localConfig;
}

function mergeConfig(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  return {
    ...base,
    ...override,
    analytics: { ...(base.analytics || {}), ...(override.analytics || {}) },
    gameAd: { ...(base.gameAd || {}), ...(override.gameAd || {}) },
  };
}

async function fetchFirstAvailable(endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new Error("No endpoint is configured");
  }
  let lastError;
  for (const endpoint of endpoints) {
    try {
      return await fetchJson(endpoint);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All endpoints failed");
}

async function fetchJson(url, timeoutMs = 12000) {
  const target = safeHttpUrl(url, location.href);
  if (!target) throw new Error(`Invalid endpoint: ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, { cache: "no-cache", signal: controller.signal });
    if (!response.ok) throw new Error(`${target} returned ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("json")) throw new Error(`${target} did not return JSON`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeGames(catalog, config) {
  if (!Array.isArray(catalog)) throw new Error("Catalog is not an array");
  const allowedHosts = new Set(config.allowedGameHosts || []);
  const seen = new Set();

  return catalog
    .map((game) => toGame(game, allowedHosts))
    .filter(Boolean)
    .filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    })
    .sort(compareGames);
}

function toGame(raw, allowedHosts) {
  if (!raw || raw.status !== "verified" || typeof raw.pagesUrl !== "string") return null;
  const playUrl = buildPlayUrl(raw.pagesUrl, raw.entryPath);
  if (!playUrl || !allowedHosts.has(playUrl.hostname)) return null;

  const title = readableTitle(raw);
  const sourceUrl = safeHttpUrl(raw.repo);
  const coverUrl = safeHttpUrl(raw.cover, playUrl.href);
  const acquireUrl = safeHttpUrl(raw.acquireUrl);
  return {
    id: raw.id || `${raw.owner || "unknown"}/${raw.name || title}`,
    title,
    owner: raw.owner || "未知作者",
    name: raw.name || "未知仓库",
    engine: raw.engine || "RPG Maker",
    totalSize: Number.isFinite(Number(raw.totalSize)) ? Number(raw.totalSize) : null,
    coverUrl: coverUrl?.href || "",
    playUrl: playUrl.href,
    sourceUrl: sourceUrl?.href || "",
    acquireUrl: acquireUrl?.href || "",
    runtimePassed: raw.runtime?.status === 'passed' || raw.runtimeStatus === 'passed',
    searchText: [title, raw.owner, raw.name, raw.engine].filter(Boolean).join(" ").toLowerCase(),
  };
}

function compareGames(a, b) {
  if (a.runtimePassed !== b.runtimePassed) return a.runtimePassed ? -1 : 1;
  const chinese = (game) => /[\u3400-\u9fff]/u.test(game.title);
  if (chinese(a) !== chinese(b)) return chinese(a) ? -1 : 1;
  if (Boolean(a.coverUrl) !== Boolean(b.coverUrl)) return a.coverUrl ? -1 : 1;
  if (a.totalSize !== b.totalSize) return (b.totalSize || -1) - (a.totalSize || -1);
  return a.title.localeCompare(b.title, state.language === "en" ? "en" : "zh-Hans");
}

function buildPlayUrl(pagesUrl, entryPath) {
  return resolveGameUrl(pagesUrl, entryPath);
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const games = query
    ? state.games.filter((game) => game.searchText.includes(query))
    : state.games;
  elements.catalog.replaceChildren();
  state.filtered = games;
  state.rendered = 0;
  state.adIndex = 0;
  state.nextAdAt = intervalFor(0, getCardInterval());

  if (games.length === 0) {
    elements.catalog.append(createStateCard(query ? copy().empty : '目录已恢复。新账号的游戏资源尚待发布验证，本站暂不展示旧账号的失效入口。'));
    setStatus(query ? copy().matched(0) : copy().loaded(0));
    return;
  }

  appendBatch();
  setStatus(query ? copy().matched(games.length) : copy().loaded(games.length));
}

function appendBatch() {
  if (state.rendered >= state.filtered.length) return;
  const fragment = document.createDocumentFragment();
  const end = Math.min(state.rendered + 24, state.filtered.length);
  const cardAds = getSlotAds('cards');
  while (state.rendered < end) {
    fragment.append(createGameCard(state.filtered[state.rendered++]));
    if (state.rendered === state.nextAdAt && state.rendered < state.filtered.length) {
      if (cardAds.length) fragment.append(createCardAd(cardAds[state.adIndex % cardAds.length]));
      state.nextAdAt += intervalFor(++state.adIndex, getCardInterval());
    }
  }
  // Append only: never replace existing cards, focus or scroll position during pagination.
  elements.catalog.append(fragment);
  if (document.documentElement.scrollHeight <= innerHeight + 600 && state.rendered < state.filtered.length) {
    requestAnimationFrame(appendBatch);
  }
}

function createGameCard(game) {
  const card = elements.gameTemplate.content.cloneNode(true);
  const defaultCover = safeHttpUrl(state.config.defaultCoverUrl, location.href)?.href || "/assets/cover-placeholder.svg";
  const base = card.querySelector(".cover-base");
  const image = card.querySelector(".cover-image");
  base.src = defaultCover;
  if (game.coverUrl) {
    image.src = game.coverUrl;
    image.alt = `${game.title} 封面`;
    image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
  } else {
    image.remove();
  }

  card.querySelector(".game-title").textContent = game.title;
  card.querySelector(".game-repo").textContent = `${game.owner}/${game.name}`;
  card.querySelector(".engine").textContent = game.engine;
  const size = card.querySelector(".size");
  if (game.totalSize != null) {
    size.hidden = false;
    size.textContent = formatSize(game.totalSize);
  }

  const play = card.querySelector(".play");
  play.href = buildLauncherUrl(game);
  play.dataset.gameId = game.id;
  for (const selector of ['.cover-frame', '.game-heading']) {
    const region = card.querySelector(selector);
    const link = document.createElement('a');
    link.href = play.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.className = 'game-region-link'; link.setAttribute('aria-label', `${copy().play}：${game.title}`);
    region.replaceWith(link); link.append(region);
  }

  const source = card.querySelector(".source");
  if (game.sourceUrl) {
    source.href = game.sourceUrl;
    source.dataset.sourceId = game.id;
    source.setAttribute("aria-label", `${copy().source}：${game.title}`);
    source.title = `${copy().source}：${game.title}`;
  } else {
    source.remove();
  }

  const acquire = card.querySelector(".acquire");
  acquire.href = game.acquireUrl || safeHttpUrl(state.ads.acquireUrl || state.config.acquireUrl)?.href || "https://pipifu.com/";
  acquire.dataset.acquireId = game.id;
  applyCopy(card);
  return card;
}

function buildLauncherUrl(game) {
  const launcher = new URL(state.config.launcherPath || '/play.html', location.origin);
  launcher.searchParams.set("id", game.id);
  return launcher.href;
}

function normalizeAds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ads: [], slots: {} };
  return {
    ...value,
    ads: Array.isArray(value.ads) ? value.ads.filter(isValidAd) : [],
    slots: value.slots && typeof value.slots === "object" ? value.slots : {},
  };
}

function getSlotAds(slot) {
  return getAdsForSlot(state.ads, slot);
}

function isValidAd(ad) {
  return Boolean(ad && typeof ad.text === "string" && ad.text.trim() && safeHttpUrl(ad.url));
}

function renderAdSlot(element, slot) {
  const ads = getSlotAds(slot);
  const ad = ads[0];
  if (!ad) {
    element.closest(".ad-slot").hidden = true;
    return;
  }
  element.href = safeHttpUrl(ad.url).href;
  element.closest('.ad-slot').hidden = false;
  element.textContent = ad.text;
  element.dataset.adSlot = slot;
}

function createCardAd(ad) {
  const node = elements.adTemplate.content.cloneNode(true);
  const link = node.querySelector("a");
  link.href = safeHttpUrl(ad.url).href;
  link.dataset.adSlot = "cards";
  link.querySelector("strong").textContent = ad.text;
  return node;
}

function getCardInterval() {
  const min = clampInteger(state.ads.cardInterval?.min, 8, 12, 8);
  const max = clampInteger(state.ads.cardInterval?.max, min, 12, 12);
  return { min, max };
}

function intervalFor(index, { min, max }) {
  const range = max - min + 1;
  const columns = getComputedStyle(elements.catalog).gridTemplateColumns.split(' ').length || 1;
  return Math.min(max, Math.max(min, Math.round((min + ((index * 7 + 3) % range)) / columns) * columns));
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function applyConfig() {
  const publishUrl = safeHttpUrl(state.config.publishUrl)?.href || "https://ecy.al/";
  elements.publish.href = publishUrl;
  elements.footerPublish.href = publishUrl;
  document.title = `${state.config.title || "Web RPG"} · ${state.config.siteName || "ecy.al"}`;
  document.querySelector('.brand-text h1').textContent = state.config.title || 'Web RPG';
  document.querySelector('meta[name="description"]').content = state.config.description || '';
  applyLanguage();
}

function setLanguage(language) {
  if (!(language in COPY)) return;
  state.language = language;
  try { localStorage.setItem("rpg-portal-language", language); } catch { /* storage is optional */ }
  state.games.sort(compareGames);
  applyLanguage();
  render();
}

function applyLanguage() {
  const language = state.language in COPY ? state.language : "zh-Hans";
  document.documentElement.lang = language;
  elements.tagline.textContent = state.config.tagline || copy().tagline;
  elements.search.placeholder = copy().searchPlaceholder;
  document.querySelectorAll("[data-language]").forEach((button) => {
    const active = button.dataset.language === language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  applyCopy(document);
}

function applyCopy(root) {
  root.querySelectorAll?.("[data-copy]").forEach((node) => {
    node.textContent = copy()[node.dataset.copy];
  });
}

function copy() {
  return COPY[state.language] || COPY["zh-Hans"];
}

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem("rpg-portal-language");
    if (saved && saved in COPY) return saved;
  } catch { /* storage is optional */ }
  const language = navigator.language || "";
  if (language.startsWith("ja")) return "ja";
  if (language.startsWith("en")) return "en";
  return "zh-Hans";
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
}

function createStateCard(message) {
  const node = document.createElement("div");
  node.className = "state-card";
  node.textContent = message;
  return node;
}

function trackClick(event) {
  const target = event.target.closest("[data-game-id],[data-source-id],[data-acquire-id],[data-ad-slot]");
  if (!target) return;
  if (target.dataset.gameId) sendEvent("play_open", { gameId: target.dataset.gameId });
  if (target.dataset.sourceId) sendEvent("source_open", { gameId: target.dataset.sourceId });
  if (target.dataset.acquireId) sendEvent("acquire_click", { gameId: target.dataset.acquireId });
  if (target.dataset.adSlot) sendEvent("ad_click", { slot: target.dataset.adSlot });
}

function sendEvent(name, data = {}) {
  const endpoint = safeHttpUrl(state.config.analytics?.endpoint);
  if (!endpoint) return;
  const payload = JSON.stringify({
    event: name,
    site: state.config.analytics?.siteId || "rpg-portal",
    path: location.pathname,
    at: new Date().toISOString(),
    ...data,
  });
  try {
    navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
  } catch { /* analytics must never break the portal */ }
}

function safeHttpUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function readableTitle(game) {
  const title = String(game.title || "").replace(/https?:\/\/\S+|t\.me\/\S+/gi, '').replace(/里番黄油聚集地|里番黄油聚集群/g, '').trim();
  return title && !/^__template__$/i.test(title)
    ? title
    : String(game.name || game.id || "未命名游戏");
}

function formatSize(kilobytes) {
  let bytes = kilobytes * 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index += 1;
  }
  return `${bytes.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}
