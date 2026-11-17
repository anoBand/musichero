/* Music Hero service worker.
   Page, scripts, styles and manifest: network first, so a push shows up on the next open; the cache is the offline fallback.
   Samples, icons and fonts: cache first, since they only change with a new file name or VERSION. */
const VERSION = 'v21';
const CACHE = 'musichero-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/theory.js',
  'js/progress.js',
  'js/app-state.js',
  'js/audio.js',
  'js/views.js',
  'js/quiz.js',
  'js/practice.js',
  'js/main.js',
  'js/native.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'samples/acoustic_grand_piano/A3.mp3',
  'samples/acoustic_grand_piano/A4.mp3',
  'samples/acoustic_grand_piano/A5.mp3',
  'samples/acoustic_grand_piano/C3.mp3',
  'samples/acoustic_grand_piano/C4.mp3',
  'samples/acoustic_grand_piano/C5.mp3',
  'samples/acoustic_grand_piano/C6.mp3',
  'samples/acoustic_grand_piano/Eb3.mp3',
  'samples/acoustic_grand_piano/Eb4.mp3',
  'samples/acoustic_grand_piano/Eb5.mp3',
  'samples/acoustic_grand_piano/Gb3.mp3',
  'samples/acoustic_grand_piano/Gb4.mp3',
  'samples/acoustic_grand_piano/Gb5.mp3',
  'samples/acoustic_guitar_steel/A3.mp3',
  'samples/acoustic_guitar_steel/A4.mp3',
  'samples/acoustic_guitar_steel/A5.mp3',
  'samples/acoustic_guitar_steel/C3.mp3',
  'samples/acoustic_guitar_steel/C4.mp3',
  'samples/acoustic_guitar_steel/C5.mp3',
  'samples/acoustic_guitar_steel/C6.mp3',
  'samples/acoustic_guitar_steel/Eb3.mp3',
  'samples/acoustic_guitar_steel/Eb4.mp3',
  'samples/acoustic_guitar_steel/Eb5.mp3',
  'samples/acoustic_guitar_steel/Gb3.mp3',
  'samples/acoustic_guitar_steel/Gb4.mp3',
  'samples/acoustic_guitar_steel/Gb5.mp3',
  'samples/electric_bass_finger/A2.mp3',
  'samples/electric_bass_finger/C3.mp3',
  'samples/electric_bass_finger/Eb2.mp3',
  'samples/electric_bass_finger/Eb3.mp3',
  'samples/electric_bass_finger/Gb2.mp3',
  'samples/electric_piano_2/A3.mp3',
  'samples/electric_piano_2/A4.mp3',
  'samples/electric_piano_2/A5.mp3',
  'samples/electric_piano_2/C3.mp3',
  'samples/electric_piano_2/C4.mp3',
  'samples/electric_piano_2/C5.mp3',
  'samples/electric_piano_2/C6.mp3',
  'samples/electric_piano_2/Eb3.mp3',
  'samples/electric_piano_2/Eb4.mp3',
  'samples/electric_piano_2/Eb5.mp3',
  'samples/electric_piano_2/Gb3.mp3',
  'samples/electric_piano_2/Gb4.mp3',
  'samples/electric_piano_2/Gb5.mp3',
  'samples/synth_bass_1/A2.mp3',
  'samples/synth_bass_1/C3.mp3',
  'samples/synth_bass_1/Eb2.mp3',
  'samples/synth_bass_1/Eb3.mp3',
  'samples/synth_bass_1/Gb2.mp3'
];

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
  const fresh = own && (req.mode === 'navigate' || /(\/|index\.html|manifest\.webmanifest|\.js|\.css)$/.test(url.pathname));
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
