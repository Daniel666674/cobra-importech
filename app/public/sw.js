/* Service worker mínimo: guarda los archivos estáticos para abrir más rápido y muestra una página si no hay internet.
   Los datos del negocio NUNCA se guardan aquí: siempre se piden al servidor. */
const CACHE = "importech-static-v1";
const STATIC = [/^\/_next\/static\//, /^\/icons\//, /^\/vendor\//, /^\/logo\.png$/];
const OFFLINE = new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7f9;color:#111827"><main style="text-align:center;padding:24px"><h1>Sin conexión</h1><p>Importech necesita internet para guardar ventas e inventario. Revisa tu conexión e intenta de nuevo.</p><button onclick="location.reload()" style="padding:10px 18px;border-radius:8px;border:0;background:#4f46e5;color:#fff;font-weight:600">Reintentar</button></main></body>',
  { headers: { "content-type": "text/html; charset=utf-8" }, status: 503 },
);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (STATIC.some((r) => r.test(url.pathname))) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.mode === "navigate") e.respondWith(fetch(req).catch(() => OFFLINE.clone()));
});
