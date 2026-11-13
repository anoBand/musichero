/* Music Hero service worker.
   Page and manifest: network first, so a push shows up on the next open; the cache is the offline fallback.
   Library, icons and fonts: cache first, since they only change with a new file name or VERSION. */
const VERSION = 'v6';
const CACHE = 'musichero-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'vendor/tone-14.8.49.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('musichero-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!own && !fonts) return;
  const fresh = own && (req.mode === 'navigate' || /(\/|index\.html|manifest\.webmanifest)$/.test(url.pathname));
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const put = (res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; };
      if (fresh) {
        try { return put(await fetch(own && req.mode === 'navigate' ? url.href : req, { cache: 'no-cache' })); }
        catch (err) { return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('index.html')); }
      }
      const hit = await cache.match(req, { ignoreSearch: own });
      return hit || put(await fetch(req));
    })
  );
});
