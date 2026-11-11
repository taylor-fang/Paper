// Paper's website, installed: the newest page when online, the last one seen when offline. Fonts and pictures come
// straight from the cache (so pages open at once) and are refreshed in the background for next time.
// Your papers aren't here; they're in the browser's own storage.
const CACHE = 'paper';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fresh = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (url.pathname.includes('/assets/')) { // fonts and pictures: the cached copy now, a fresh one for next time
      const kept = await cache.match(req);
      if (kept) { e.waitUntil(fresh.catch(() => {})); return kept; }
    }
    try {
      return await fresh;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('./') : Response.error());
    }
  })());
});
