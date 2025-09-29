const CACHE_NAME = "nav-cache-v1";
const urlsToCache = [
  "/nav-education/index.html",
  "/nav-education/splash.html",
  "/nav-education/script.js",
  "/nav-education/manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
