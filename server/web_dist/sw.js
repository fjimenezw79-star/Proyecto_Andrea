/* Modas Andrea · Service worker (adaptado de AcuaGest DEMO 3.0).
 * - La app (index.html y assets) se guarda al instalar; las pantallas se piden a la red y, sin señal, salen de la copia.
 * - Miniaturas de fotos: se sirven de la copia y se actualizan en segundo plano.
 * - Modelo de reconocimiento (/vision/*): se guarda la primera vez que se usa y sirve sin señal.
 * - /api/* nunca pasa por aquí: los datos siempre son en vivo (y la cola sin señal vive en la app).
 */
const VERSION = "d66c211f66ec";
const PRECACHE = ["/","/index.html","/assets/index-YIDLiH4h.js","/assets/esm-DAg8Zty3.js","/assets/vision_bundle-57SJLsoe.js","/assets/hanken-grotesk-latin-ext-wght-normal-Dg-wlmqe.woff2","/assets/hanken-grotesk-latin-wght-normal-CaVRRdDk.woff2","/assets/hanken-grotesk-vietnamese-wght-normal-CHiFlh_0.woff2","/assets/index-BosxIaR1.css","/assets/instrument-serif-latin-400-italic-DKMiL14s.woff2","/assets/instrument-serif-latin-400-italic-u__WvvIK.woff","/assets/instrument-serif-latin-400-normal-BVbkICAY.woff","/assets/instrument-serif-latin-400-normal-DnYpCC2O.woff2","/assets/instrument-serif-latin-ext-400-italic-C9HzH3YL.woff2","/assets/instrument-serif-latin-ext-400-italic-D7-lnxEk.woff","/assets/instrument-serif-latin-ext-400-normal-C2je3j2s.woff2","/assets/instrument-serif-latin-ext-400-normal-CFCUzsTy.woff","/manifest.webmanifest","/favicon.svg","/icon-192.png","/icon-512.png"];
const APP = `ma-app-${VERSION}`;
const THUMBS = "ma-thumbs";
const VISION = "ma-vision"; // modelo de reconocimiento (~19 MB): se guarda una vez y no cambia con cada versión

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
  // la tienda en línea (/tienda/) es pública y siempre en vivo: no pasa por la copia de la app
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/tienda") || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cached = async () => (await caches.match("/index.html")) || new Response("Sin señal", { status: 503 });
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(APP)).put("/index.html", res.clone());
        // Cloudflare responde con su página de error cuando la PC del negocio no contesta: se abre la copia
        if (res.status >= 500) return cached();
        return res;
      } catch {
        return cached();
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/vision/")) {
    e.respondWith((async () => {
      const cache = await caches.open(VISION);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
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
