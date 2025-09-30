// Names of the cache
const CACHE_NAME = 'nav-education-cache-v1';

// List of files to cache (add more as needed for your app)
const urlsToCache = [
  '/',
  '/NAV_Education/index.html',
  '/NAV_Education/manifest.json',
  '/NAV_Education/script.js',
  // Add more static resources here (css, images, etc)
];

// Install event: cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(self.skipWaiting())
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    ).then(self.clients.claim())
  );
});

// Fetch event: try cache, then network, fallback if offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(() => new Response('Offline'))
  );
});
