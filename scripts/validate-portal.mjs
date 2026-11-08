import fs from "node:fs/promises";

const [config, ads, indexHtml, appJs, playHtml] = await Promise.all([
  readJson("config.json"),
  readJson("ads.json"),
  fs.readFile("index.html", "utf8"),
  fs.readFile("app.js", "utf8"),
  fs.readFile("play.html", "utf8"),
]);

const failures = [];
const requireValue = (condition, message) => { if (!condition) failures.push(message); };
const isHttpUrl = (value) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
};

requireValue(typeof config.title === 'string' && config.title.trim(), "config.title is required");
requireValue(typeof config.tagline === 'string', "tagline must be text");
requireValue(isHttpUrl(config.publishUrl), "publishUrl must be HTTP(S)");
requireValue(isHttpUrl(config.acquireUrl), "acquireUrl must be HTTP(S)");
requireValue(config.launcherPath === "/play.html", "launcherPath must point to /play.html");
requireValue(Array.isArray(config.catalogEndpoints) && config.catalogEndpoints.length > 0, "catalogEndpoints is empty");
requireValue(Array.isArray(config.adsEndpoints) && config.adsEndpoints.length > 0, "adsEndpoints is empty");
requireValue(Array.isArray(config.allowedGameHosts) && config.allowedGameHosts.includes("opsemilygohmbza.github.io"), "own Pages host is not allowed");
requireValue(typeof config.gameAd?.enabled === 'boolean', "game ad switch must be boolean");
requireValue(Number(config.gameAd?.repeatSeconds) >= 60, "game ad repeat must be at least 60 seconds");
requireValue(Number(config.gameAd?.closeDelaySeconds) >= 0, "game ad close delay is invalid");

requireValue(Array.isArray(ads.ads), "ads.ads must be an array");
requireValue(ads.ads?.length === 13, `expected exactly 13 ads, got ${ads.ads?.length ?? 0}`);
const ids = new Set();
const texts = new Set();
for (const ad of ads.ads || []) {
  requireValue(typeof ad.id === "string" && ad.id.length > 0, "an ad is missing id");
  requireValue(!ids.has(ad.id), `duplicate ad id: ${ad.id}`);
  requireValue(typeof ad.text === "string" && ad.text.trim().length >= 12, `ad copy is too short: ${ad.id}`);
  requireValue(!texts.has(ad.text), `duplicate ad copy: ${ad.id}`);
  requireValue(isHttpUrl(ad.url), `invalid ad URL: ${ad.id}`);
  ids.add(ad.id);
  texts.add(ad.text);
}

requireValue(Number(ads.cardInterval?.min) >= 8, "card ad minimum interval must be at least 8");
requireValue(Number(ads.cardInterval?.max) <= 12, "card ad maximum interval must be at most 12");
requireValue(Number(ads.cardInterval?.min) <= Number(ads.cardInterval?.max), "card ad interval range is reversed");
for (const slot of ["header", "search", "cards", "gameStart", "gameTimed"]) {
  const setting = ads.slots?.[slot];
  const entries = Array.isArray(setting) ? setting : setting?.ads;
  requireValue(Array.isArray(entries), `invalid ad slot: ${slot}`);
  for (const id of entries || []) requireValue(ids.has(id), `unknown ad id ${id} in slot ${slot}`);
}

requireValue(indexHtml.includes('id="publish-link"'), "publish link is missing");
requireValue(indexHtml.includes('id="game-card-template"'), "game card template is missing");
requireValue(indexHtml.includes('id="card-ad-template"'), "card ad template is missing");
requireValue(indexHtml.includes('class="pixel-button source" hidden'), "source action must be hidden");
requireValue(indexHtml.includes('rel="noopener noreferrer sponsored"'), "sponsored link protections are missing");
requireValue(playHtml.includes('id="ad-modal"'), "game ad modal is missing");
requireValue(playHtml.includes("scheduleAds()"), "game ad scheduler is missing");
requireValue(playHtml.includes("iframeSandbox"), "iframe sandbox configuration is missing");

for (const [name, source] of [["index.html", indexHtml], ["app.js", appJs], ["play.html", playHtml]]) {
  requireValue(!source.includes("webrpg.org"), `${name} still references the old domain`);
  requireValue(!/google-analytics|googletagmanager|gtag\(|matomo|umami|plausible/i.test(source), `${name} contains an unapproved analytics integration`);
}
requireValue(!/<script\s+[^>]*src=["']https?:/i.test(indexHtml + playHtml), "external script dependency is not allowed");

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Portal validation passed: ${ads.ads.length} ads, card interval ${ads.cardInterval.min}-${ads.cardInterval.max}, game ads enabled.`);
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}
