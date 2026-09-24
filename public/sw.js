/* Sri Ramakrishna Hospital — NICU Cloud Handover
   Standalone PWA service worker: offline fallback only.

   Freshness rules (why production used to show an old UI):
   - Documents and React Router (RSC) payloads are NEVER served from cache while
     online. A cached flight payload renders the previous deploy's React tree,
     so the browser happily showed old UI long after a new build went live.
   - Only immutable, content-hashed build assets (/_next/static/*) are served
     cache-first; those change filename on every deploy.
   - Cache names carry VERSION, so a new worker wipes every old cache on
     activate — including the ones left behind by the previous (buggy) worker. */

const VERSION = "srh-nicu-v3.15.0";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const DOCS = `${VERSION}-docs`;

// Only immutable assets belong here. Never precache HTML documents: a precached
// document is served even after a new deploy.
const PRECACHE = ["/icons/icon-512.png?v=3.15.0", "/images/hospital-logo.png?v=3.15.0"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL && k !== RUNTIME && k !== DOCS).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({ type: "SW_ACTIVATED", version: VERSION });
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return; // browser must always re-check the worker itself

  // 1) React Router (RSC) payloads: network only. Never cache these — a stale
  //    payload is exactly what pinned the old UI on screen across deploys.
  const isRouterPayload =
    url.searchParams.has("_rsc") ||
    req.headers.get("RSC") === "1" ||
    req.headers.get("Next-Router-Prefetch") === "1" ||
    req.headers.get("Next-Router-State-Tree") !== null;

  if (isRouterPayload) {
    event.respondWith(fetch(req));
    return;
  }

  // 2) Clinical API: network-first, fall back to the last good response offline.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (hit) =>
              hit ||
              new Response(JSON.stringify({ offline: true, babies: [] }), {
                headers: { "Content-Type": "application/json" },
              }),
          ),
        ),
    );
    return;
  }

  // 3) Documents: network-first so a deploy is visible on the next visit,
  //    cached copy only as an offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(DOCS).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  // 4) Build assets: content-hashed and immutable, safe to serve cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // 5) Everything else (icons, manifest, fonts): serve cached copy, refresh in
  //    the background so nothing here can go stale for long either.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
