// Service worker minimal : rend le site installable et garde en cache les fichiers statiques
// (scripts, polices, sons, icones). Les pages et l'API passent toujours par le reseau.
const CACHE = "tablee-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  const isStatic = url.pathname.startsWith("/assets/") || url.pathname.startsWith("/sounds/") || /\.(png|svg|woff2)$/.test(url.pathname);
  if (!isStatic) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    }),
  );
});
