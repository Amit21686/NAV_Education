// =============================================
// NAV EDUCATION – FULL OFFLINE SERVICE WORKER
// =============================================
const CACHE_NAME = 'nav-education-v2';

// All critical assets that must be available offline
const PRE_CACHE = [
  // App shell files (your local files)
  '/NAV_Education/',
  '/NAV_Education/index.html',
  '/NAV_Education/styles.css',
  '/NAV_Education/app.js',
  '/NAV_Education/manifest.json',

  // External CDN styles & scripts
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js',

  // Google Fonts (the main stylesheet, not the font files themselves)
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',

  // Banner images
  'https://iili.io/K1fpl5J.md.png',
  'https://amit21686.github.io/NAV_Education/images/Nav.gif.gif',

  // Custom subject icons (all 11 images)
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160383439.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160428779.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160453087.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160318418.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160290869.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160256811.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160161106.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160214009.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160188727.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160344335.jpg',
  'https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160480030.jpg',
];

// Install: cache all critical assets immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('⚡ Pre-caching app shell…');
        return cache.addAll(PRE_CACHE).catch(err => {
          // Some CDN resources might fail; continue anyway
          console.warn('Some assets could not be cached', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: serve from cache first (stale-while-revalidate)
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return cached version immediately if we have it
      if (cachedResponse) {
        // Update cache in the background (stale-while-revalidate)
        event.waitUntil(
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          }).catch(() => {
            // network fetch failed – that's okay, we already have cached response
          })
        );
        return cachedResponse;
      }

      // Not in cache: fetch from network
      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Completely offline and not cached – return a simple fallback
        // For HTML requests, we can return the cached index page (if available)
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/NAV_Education/index.html');
        }
        // For anything else, just fail (this is very rare)
        return new Response('Offline – resource not available', { status: 503 });
      });
    })
  );
});
