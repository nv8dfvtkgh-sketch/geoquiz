// Quizellige : service worker minimal. Toujours le réseau d'abord (pour avoir la dernière version) ;
// la copie gardée ne sert que hors ligne. Les parties en direct (API, WebSocket) ne passent jamais par ici.
const CACHE = 'quizellige-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;
  const page = req.mode === 'navigate';
  const shell = page || /\.(js|css|svg|png|webmanifest)$/.test(url.pathname);
  if (!shell) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(page ? '/' : req, copy)); }
      return res;
    }).catch(() => caches.match(page ? '/' : req).then((r) => r || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))),
  );
});
