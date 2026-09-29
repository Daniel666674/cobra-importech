/* Service worker · Importech
   - Precarga el "shell" de la app para que abra sin internet.
   - Las versiones se separan por caché: __BUILD__ lo reemplaza el workflow en cada publicación.
   - La actualización espera a que el usuario la acepte (mensaje SKIP_WAITING). */
const BUILD = '__BUILD__';
const SHELL_CACHE = 'importech-shell-' + BUILD;
const FONT_CACHE = 'importech-fonts-v1';
const SHELL = [
  './', 'index.html', '404.html', 'manifest.webmanifest',
  'assets/app.css',
  'js/data.js', 'js/core.js', 'js/views-ops.js', 'js/views-sales.js', 'js/receipts.js', 'js/views-admin.js', 'js/app.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/maskable-512.png', 'assets/icons/apple-touch-icon.png', 'assets/icons/favicon-32.png', 'assets/brand/logo.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('importech-') && k !== SHELL_CACHE && k !== FONT_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Tipografías de Google: usa lo guardado y actualiza en segundo plano */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }

  if (url.origin !== location.origin) return;

  /* Documentos y archivos de la app: primero lo guardado (rápido y sin internet) */
  e.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r && r.ok && url.pathname.startsWith(new URL('./', location).pathname)) cache.put(req, r.clone());
      return r;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
