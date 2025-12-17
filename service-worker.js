const CACHE_NAME = "nav-runtime-cache-v1";

// Install: nothing pre-cached
self.addEventListener("install", event => {
  self.skipWaiting();
});

// Activate: clean old cache
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Runtime caching: ONLY visited files
self.addEventListener("fetch", event => {

  const request = event.request;

  // Cache only GET requests
  if (request.method !== "GET") return;

  // Only cache html & json files
  if (
    request.url.endsWith(".html") ||
    request.url.endsWith(".json")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        fetch(request)
          .then(response => {
            cache.put(request, response.clone());
            return response;
          })
          .catch(() => caches.match(request))
      )
    );
  }
});