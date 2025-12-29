// final-sw.js - COMPLETE SOLUTION
const CACHE_NAME = 'nav-edu-final-' + Date.now();
const MAX_ITEMS = 1000;

// ========== CACHE EVERYTHING USER VISITS ==========
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // For our app files: Network First (to check updates)
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      networkFirstWithUpdateCheck(event.request)
    );
  } else {
    // External resources: Cache First
    event.respondWith(
      cacheFirstWithBackgroundUpdate(event.request)
    );
  }
});

// NETWORK FIRST - for update detection
async function networkFirstWithUpdateCheck(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Try to fetch fresh from network
    const networkResponse = await fetch(request);
    
    // Check if update available
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      try {
        const cachedText = await cachedResponse.text();
        const networkText = await networkResponse.text();
        
        // If content changed, notify user
        if (cachedText !== networkText) {
          notifyUpdateAvailable(request.url);
        }
      } catch (e) {
        // Can't compare, ignore
      }
    }
    
    // Cache the fresh response
    await cache.put(request, networkResponse.clone());
    await manageCacheSize(cache);
    
    return networkResponse;
  } catch (error) {
    // Network failed, use cache
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

// CACHE FIRST - for external resources
async function cacheFirstWithBackgroundUpdate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  // Always try to update in background
  fetch(request)
    .then(async response => {
      if (response.ok) {
        // Check if content changed
        if (cached) {
          try {
            const cachedText = await cached.text();
            const freshText = await response.clone().text();
            if (cachedText !== freshText) {
              notifyUpdateAvailable(request.url);
            }
          } catch (e) {}
        }
        
        // Update cache
        await cache.put(request, response.clone());
        await manageCacheSize(cache);
      }
    })
    .catch(() => {}); // Ignore errors
    
  // Return cached if available
  return cached || fetch(request);
}

// ========== NOTIFICATION SYSTEM ==========
function notifyUpdateAvailable(url) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'UPDATE_AVAILABLE',
        url: url,
        time: new Date().toLocaleTimeString()
      });
    });
  });
}

// ========== CACHE MANAGEMENT ==========
async function manageCacheSize(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length > MAX_ITEMS) {
      // Remove 20% oldest items
      const toDelete = keys.slice(0, Math.floor(keys.length * 0.2));
      for (const key of toDelete) {
        await cache.delete(key);
      }
    }
  } catch (error) {
    console.log('Cache cleanup error:', error);
  }
}

// ========== INSTALL ==========
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  
  const criticalFiles = [
    '/NAV_Education/',
    '/NAV_Education/index.html',
    '/NAV_Education/manifest.json'
  ];
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(criticalFiles))
      .then(() => self.skipWaiting())
  );
});

// ========== ACTIVATE ==========
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ========== MESSAGE HANDLING ==========
self.addEventListener('message', event => {
  if (event.data === 'checkForUpdates') {
    checkAllForUpdates();
  } else if (event.data === 'getCacheInfo') {
    getCacheInfo(event.ports[0]);
  } else if (event.data === 'prefetch') {
    prefetchUrls(event.data.urls);
  }
});

// Check all cached files for updates
async function checkAllForUpdates() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  let updateCount = 0;
  
  for (const request of keys) {
    try {
      const networkResponse = await fetch(request.url);
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse && networkResponse.ok) {
        const cachedText = await cachedResponse.text();
        const networkText = await networkResponse.text();
        
        if (cachedText !== networkText) {
          updateCount++;
          await cache.put(request, networkResponse.clone());
        }
      }
    } catch (error) {
      // Skip errors
    }
  }
  
  // Notify if updates found
  if (updateCount > 0) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'UPDATES_FOUND',
          count: updateCount
        });
      });
    });
  }
}

// Get cache information
async function getCacheInfo(port) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    let totalSize = 0;
    const items = [];
    
    for (const key of keys.slice(0, 50)) { // Limit to 50 items
      const response = await cache.match(key);
      if (response) {
        const blob = await response.blob();
        items.push({
          url: key.url,
          size: blob.size,
          type: response.headers.get('content-type') || 'unknown'
        });
        totalSize += blob.size;
      }
    }
    
    port.postMessage({
      totalItems: keys.length,
      totalSize: totalSize,
      sampleItems: items
    });
  } catch (error) {
    port.postMessage({ error: error.message });
  }
}

// Prefetch URLs
async function prefetchUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());
      }
    } catch (error) {
      console.log('Prefetch failed:', url);
    }
  }
}