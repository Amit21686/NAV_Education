// final-sw.js - UPDATED FOR PRIORITY NOTIFICATIONS
const CACHE_NAME = 'nav-edu-v2';
const APP_VERSION = '1.0.0';
const MANIFEST_URL = '/NAV_Education/app-manifest.json';

// Hash function for content comparison
async function getContentHash(response) {
  try {
    const text = await response.clone().text();
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  } catch (e) {
    return Date.now().toString(36);
  }
}

// Cooldown tracking to prevent spam
let lastNotificationTime = {};
const NOTIFICATION_COOLDOWN = 30000; // 30 seconds

// ========== CACHE EVERYTHING USER VISITS ==========
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip external URLs (like chrome-extension://)
  if (!event.request.url.startsWith('http')) return;

  // For our app files: Network First with hash checking
  if (event.request.url.includes('/NAV_Education/')) {
    event.respondWith(
      networkFirstWithHashCheck(event.request)
    );
  } else {
    // External resources: Cache First
    event.respondWith(
      cacheFirstWithBackgroundUpdate(event.request)
    );
  }
});

// NETWORK FIRST with Hash Check
async function networkFirstWithHashCheck(request) {
  const cache = await caches.open(CACHE_NAME);
  const url = request.url;
  const now = Date.now();

  try {
    // Try to fetch fresh from network
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Get hash of new content
      const newHash = await getContentHash(networkResponse);

      // Check if we have cached version
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        // Get hash of cached content
        const cachedHash = await getContentHash(cachedResponse);

        // If content changed AND not in cooldown, notify
        if (cachedHash !== newHash) {
          const key = `update_${url}_${newHash}`;
          
          // Check cooldown
          if (!lastNotificationTime[key] || 
              (now - lastNotificationTime[key] > NOTIFICATION_COOLDOWN)) {
            
            lastNotificationTime[key] = now;
            
            // Send notification with hash
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: 'CONTENT_UPDATED',
                  url: url,
                  hash: newHash,
                  file: url.split('/').pop(),
                  timestamp: now
                });
              });
            });
          }
        }
      } else {
        // New file detected (not in cache)
        const key = `new_${url}_${newHash}`;
        
        // Check cooldown
        if (!lastNotificationTime[key] || 
            (now - lastNotificationTime[key] > NOTIFICATION_COOLDOWN)) {
          
          lastNotificationTime[key] = now;
          
          // Send new file notification
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'NEW_CONTENT',
                url: url,
                hash: newHash,
                file: url.split('/').pop(),
                timestamp: now
              });
            });
          });
        }
      }

      // Cache the fresh response
      await cache.put(request, networkResponse.clone());
      await manageCacheSize(cache);

      return networkResponse;
    }

    throw new Error('Network response not ok');

  } catch (error) {
    // Network failed, use cache
    const cached = await cache.match(request);
    if (cached) return cached;
    
    // If nothing in cache and network failed
    return new Response('Offline - Content not available', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// CACHE FIRST for external resources
async function cacheFirstWithBackgroundUpdate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Return cached immediately for performance
  if (cached) {
    // Update in background
    fetch(request)
      .then(response => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => {});
    
    return cached;
  }

  // Not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      await manageCacheSize(cache);
    }
    return networkResponse;
  } catch (error) {
    throw error;
  }
}

// ========== VERSION CHECKING ==========
async function checkVersionUpdate() {
  try {
    const response = await fetch(MANIFEST_URL + '?t=' + Date.now());
    if (response.ok) {
      const data = await response.json();
      const cache = await caches.open(CACHE_NAME);
      const cachedManifest = await cache.match(MANIFEST_URL);

      if (cachedManifest) {
        const cachedData = await cachedManifest.json();
        
        // If version changed
        if (cachedData.version !== data.version) {
          // Notify about version update
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'VERSION_UPDATE',
                version: data.version,
                changelog: data.changelog || 'New version available',
                timestamp: Date.now()
              });
            });
          });

          // Update cached manifest
          await cache.put(MANIFEST_URL, response.clone());
        }
      } else {
        // First time, cache the manifest
        await cache.put(MANIFEST_URL, response.clone());
      }
    }
  } catch (error) {
    console.log('Version check failed:', error);
  }
}

// ========== CACHE MANAGEMENT ==========
async function manageCacheSize(cache) {
  try {
    const keys = await cache.keys();
    const MAX_ITEMS = 500;

    if (keys.length > MAX_ITEMS) {
      // Get info about all items
      const items = [];
      for (const key of keys) {
        const response = await cache.match(key);
        if (response) {
          const blob = await response.blob();
          items.push({
            key: key,
            size: blob.size,
            timestamp: Date.now() // We'll use access time
          });
        }
      }

      // Sort by size (largest first) and remove 20%
      items.sort((a, b) => b.size - a.size);
      const toDelete = items.slice(0, Math.floor(items.length * 0.2));

      for (const item of toDelete) {
        await cache.delete(item.key);
      }
    }
  } catch (error) {
    console.log('Cache cleanup error:', error);
  }
}

// ========== INSTALL ==========
self.addEventListener('install', event => {
  console.log('[SW] Installing version:', APP_VERSION);

  const criticalFiles = [
    '/NAV_Education/',
    '/NAV_Education/index.html',
    '/NAV_Education/manifest.json',
    MANIFEST_URL
  ];

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(criticalFiles))
      .then(() => self.skipWaiting())
  );
});

// ========== ACTIVATE ==========
self.addEventListener('activate', event => {
  console.log('[SW] Activating new version');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches that don't match our pattern
          if (cacheName !== CACHE_NAME && cacheName.startsWith('nav-edu-')) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Check for version update on activate
      checkVersionUpdate();
      return self.clients.claim();
    })
  );
});

// ========== MESSAGE HANDLING ==========
self.addEventListener('message', event => {
  if (event.data === 'checkForUpdates') {
    checkAllForUpdates();
  } else if (event.data === 'forceCheckUpdates') {
    forceCheckAllUpdates();
  } else if (event.data === 'getCacheInfo') {
    getCacheInfo(event.ports[0]);
  } else if (event.data === 'clearCache') {
    clearCache(event.ports[0]);
  } else if (event.data && event.data.type === 'prefetch') {
    prefetchUrls(event.data.urls);
  }
});

// Check all cached files for updates
async function checkAllForUpdates() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  let updatesFound = 0;
  let newFilesFound = 0;

  for (const request of keys) {
    // Skip manifest file (handled separately)
    if (request.url === MANIFEST_URL) continue;

    try {
      const networkResponse = await fetch(request.url + '?t=' + Date.now());
      
      if (networkResponse.ok) {
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
          const cachedHash = await getContentHash(cachedResponse);
          const newHash = await getContentHash(networkResponse);

          if (cachedHash !== newHash) {
            updatesFound++;
            await cache.put(request, networkResponse.clone());
          }
        } else {
          newFilesFound++;
          await cache.put(request, networkResponse.clone());
        }
      }
    } catch (error) {
      // Skip errors
    }
  }

  // Send summary notification if updates found
  if (updatesFound > 0 || newFilesFound > 0) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'UPDATE_SUMMARY',
          updates: updatesFound,
          newFiles: newFilesFound,
          total: updatesFound + newFilesFound,
          timestamp: Date.now()
        });
      });
    });
  }

  // Also check version
  await checkVersionUpdate();
}

// Force check (bypasses cooldown)
async function forceCheckAllUpdates() {
  // Clear cooldown for force check
  lastNotificationTime = {};
  await checkAllForUpdates();
}

// Get cache information
async function getCacheInfo(port) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();

    let totalSize = 0;
    const items = [];

    for (const key of keys.slice(0, 100)) { // Limit to 100 items
      const response = await cache.match(key);
      if (response) {
        const blob = await response.blob();
        const item = {
          url: key.url,
          size: blob.size,
          type: response.headers.get('content-type') || 'unknown'
        };
        
        // Try to get hash for important files
        if (key.url.includes('.json') || key.url.includes('.html')) {
          try {
            item.hash = await getContentHash(response);
          } catch (e) {
            item.hash = 'unknown';
          }
        }
        
        items.push(item);
        totalSize += blob.size;
      }
    }

    // Get version info
    const manifestResponse = await cache.match(MANIFEST_URL);
    let version = APP_VERSION;
    if (manifestResponse) {
      try {
        const manifest = await manifestResponse.json();
        version = manifest.version;
      } catch (e) {}
    }

    port.postMessage({
      version: version,
      totalItems: keys.length,
      totalSize: totalSize,
      items: items
    });
  } catch (error) {
    port.postMessage({ error: error.message });
  }
}

// Clear cache
async function clearCache(port) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();

    // Delete all except critical files
    const criticalFiles = [
      '/NAV_Education/',
      '/NAV_Education/index.html',
      '/NAV_Education/manifest.json',
      MANIFEST_URL
    ];

    for (const key of keys) {
      if (!criticalFiles.some(critical => key.url.includes(critical))) {
        await cache.delete(key);
      }
    }

    port.postMessage({ success: true, cleared: keys.length });
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
        await manageCacheSize(cache);
      }
    } catch (error) {
      console.log('Prefetch failed:', url);
    }
  }
}

// Periodic version checking
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-updates') {
    event.waitUntil(checkVersionUpdate());
  }
});

// Background sync for updates
self.addEventListener('sync', event => {
  if (event.tag === 'update-check') {
    event.waitUntil(checkAllForUpdates());
  }
});