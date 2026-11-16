/* Paper Days — a careful service worker.
   The diary is live: pages change on every device, so nothing that
   carries the book is ever cached. Only the app's own static files
   (fonts, icons, the JS chunks) are kept, because those never change
   under the same name. */

const CACHE = "paper-days-v1";
const STATIC = /\/(_next\/static|icons)\//;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // the book and the photo vault are always live — never cached
  if (url.pathname.startsWith("/api/")) return;
  // pages and the manifest stay fresh, so the app never shows a stale diary
  if (!STATIC.test(url.pathname)) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match("/icons/icon-192.png"));
    }),
  );
});
