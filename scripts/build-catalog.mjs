import fs from 'node:fs/promises';
import { resolveGameUrl } from '../portal-lib.mjs';

const config = JSON.parse(await fs.readFile('config.json', 'utf8'));
const sourceUrl = process.env.CATALOG_SOURCE_URL || 'https://raw.githubusercontent.com/opsemilygohmbza/game-index-runner/main/list.json';
const source = process.env.CATALOG_SOURCE_FILE
  ? JSON.parse(await fs.readFile(process.env.CATALOG_SOURCE_FILE, 'utf8'))
  : await fetchJson(sourceUrl);
if (!Array.isArray(source)) throw new Error('Canonical catalog must be an array');
const allowed = new Set(config.allowedGameHosts);
const candidates = source.filter(game => {
  const url = resolveGameUrl(game.pagesUrl, game.entryPath);
  return game.status === 'verified' && url && allowed.has(url.hostname);
});
const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  while (cursor < candidates.length) {
    const game = candidates[cursor++];
    const url = resolveGameUrl(game.pagesUrl, game.entryPath);
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      const html = await response.text();
      if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '') || !/rpg_core\.js|rmmz_core\.js/i.test(html)) {
        throw new Error(`Entry is not an RPG Maker Web export (${response.status})`);
      }
      results.push({ game, ok: true });
    } catch (error) { results.push({ game, ok: false, error: error.message }); }
  }
}));
const games = results.filter(result => result.ok).map(result => result.game).sort((a,b) => a.id.localeCompare(b.id));
if (candidates.length && !games.length) throw new Error('All own-Pages candidates failed; keeping last successful deployment');
const manifest = {
  generatedAt: new Date().toISOString(), sourceUrl, sourceCount: source.length,
  candidateCount: candidates.length, publishedCount: games.length,
  runtimePassedCount: games.filter(game => game.runtime?.status === 'passed').length,
  pendingCount: source.length - games.length,
  checks: 'HTTP + HTML structure only; runtime.status is recorded separately by browser validation',
  unavailable: results.filter(result => !result.ok).map(({game,error}) => ({id:game.id,error})),
};
await fs.writeFile('games.json', `${JSON.stringify(games)}\n`);
await fs.writeFile('catalog-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
await fs.rm('dist', { recursive: true, force: true });
await fs.mkdir('dist', { recursive: true });
for (const file of ['index.html','play.html','app.js','styles.css','portal-lib.mjs','config.json','ads.json','games.json','catalog-manifest.json']) {
  await fs.copyFile(file, `dist/${file}`);
}
await fs.cp('assets', 'dist/assets', {recursive:true});
await fs.writeFile('dist/.nojekyll', '');
console.log(JSON.stringify(manifest, null, 2));

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Canonical catalog returned ${response.status}`);
  return response.json();
}
