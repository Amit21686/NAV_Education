self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("nav-cache").then(cache => {
      return cache.addAll([
        "/",
        "/index.html",
        "/splash.html",
        "/styles.css",
        "/script.js"
      ]);
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
