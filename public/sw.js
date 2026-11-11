// Service worker minimal : rend le site installable et garde en cache les fichiers statiques
// (scripts, polices, sons, icones). Les pages et l'API passent toujours par le reseau.
// v2 : les sons de Crampons ont change de contenu sous le meme nom ; changer de version vide l'ancien cache
const CACHE = "tablee-v2";

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
  // Les scripts ont un nom qui change a chaque version : le cache suffit. Un son peut changer sous le meme nom : on le
  // sert depuis le cache, et on le rafraichit en arriere-plan pour la prochaine fois
  const refresh = url.pathname.startsWith("/sounds/");
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit && !refresh) return hit;
      const update = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => undefined);
      if (hit) {
        event.waitUntil(update);
        return hit;
      }
      const res = await update;
      return res ?? Response.error();
    }),
  );
});
