/* Modas Andrea · Service worker (adaptado de AcuaGest DEMO 3.0).
 * - La app (index.html y assets) se guarda al instalar; las pantallas se piden a la red y, sin señal, salen de la copia.
 * - Miniaturas de fotos: se sirven de la copia y se actualizan en segundo plano.
 * - /api/* nunca pasa por aquí: los datos siempre son en vivo (y la cola sin señal vive en la app).
 */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const APP = `ma-app-${VERSION}`;
const THUMBS = "ma-thumbs";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("ma-app-") && k !== APP).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(APP)).put("/index.html", res.clone());
        return res;
      } catch {
        return (await caches.match("/index.html")) || new Response("Sin señal", { status: 503 });
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/uploads/") && url.pathname.endsWith("_t.webp")) {
    e.respondWith((async () => {
      const cache = await caches.open(THUMBS);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || new Response("", { status: 504 });
    })());
    return;
  }

  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
