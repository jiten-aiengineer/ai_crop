const CACHE = 'crop-life-ai-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/clsl-logo.png', '/crop-life-mitra-cutout.webp', '/crop-life-mitra.jpg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && !response.headers.get('Cache-Control')?.includes('no-store')) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(async () => (await caches.match(request)) || (request.mode === 'navigate' ? await caches.match('/') : null) || Response.error()));
});
