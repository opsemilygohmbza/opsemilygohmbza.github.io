export function resolveGameUrl(pagesUrl, entryPath = 'index.html') {
  let base;
  try { base = new URL(pagesUrl); } catch { return null; }
  if (base.protocol !== 'https:' || base.username || base.password) return null;
  const entry = String(entryPath || 'index.html').replace(/^\/+/, '');
  if (/^[a-z][a-z\d+.-]*:|\\/i.test(entry)) return null;
  let path;
  try { path = decodeURIComponent(base.pathname); } catch { return null; }
  if (/\.html?$/i.test(path) || path.replace(/^\/+/, '').endsWith(entry)) return base;
  base.search = ''; base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const target = new URL(entry, base);
  return target.origin === base.origin && target.pathname.startsWith(base.pathname) ? target : null;
}

export function getAdsForSlot(config, slot) {
  if (config?.enabled === false) return [];
  const setting = config?.slots?.[slot];
  if (setting?.enabled === false) return [];
  const ids = Array.isArray(setting) ? setting : (setting?.ads || []);
  const byId = new Map((config?.ads || []).map(ad => [ad.id, ad]));
  return ids.map(id => typeof id === 'string' ? byId.get(id) : id).filter(ad => {
    if (!ad?.text || ad.enabled === false) return false;
    try { return new URL(ad.url).protocol === 'https:'; } catch { return false; }
  });
}
