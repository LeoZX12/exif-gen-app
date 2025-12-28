// Service Worker for EXIF Border Generator
const CACHE_NAME = 'exif-border-v2';
const STATIC_CACHE = 'exif-border-static-v2';

// Files to cache for offline use
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/exif-js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip Chrome extensions
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  // Skip analytics and tracking
  if (event.request.url.includes('google-analytics') || 
      event.request.url.includes('gtag')) {
    return;
  }
  
  const requestUrl = new URL(event.request.url);
  
  // For same-origin requests, try network first
  if (requestUrl.origin === location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              
              // For navigation requests, return offline page
              if (event.request.mode === 'navigate') {
                return caches.match('/');
              }
              
              // For images, return a placeholder
              if (event.request.headers.get('Accept').includes('image')) {
                return new Response(
                  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">' +
                  '<rect width="400" height="300" fill="#f0f0f0"/>' +
                  '<text x="200" y="150" text-anchor="middle" fill="#666" font-family="sans-serif">Image not available offline</text>' +
                  '</svg>',
                  {
                    headers: { 'Content-Type': 'image/svg+xml' }
                  }
                );
              }
              
              return new Response('Offline content not available', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({ 'Content-Type': 'text/plain' })
              });
            })
        })
    );
  } else {
    // For CDN requests (exif-js, fonts), cache-first
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          return fetch(event.request)
            .then(response => {
              // Don't cache if not successful
              if (!response || response.status !== 200) {
                return response;
              }
              
              // Cache the response
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseClone));
              
              return response;
            })
            .catch(() => {
              // Return empty response for fonts to avoid console errors
              if (event.request.url.includes('fonts.googleapis.com') ||
                  event.request.url.includes('fonts.gstatic.com')) {
                return new Response('', {
                  headers: { 'Content-Type': 'text/css' }
                });
              }
              
              // For exif-js, return empty script
              if (event.request.url.includes('exif-js')) {
                return new Response('console.log("EXIF library not available offline");', {
                  headers: { 'Content-Type': 'application/javascript' }
                });
              }
              
              return new Response('Network error', {
                status: 408,
                statusText: 'Network Error'
              });
            });
        })
    );
  }
});

// Background sync for failed requests (when online again)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-images') {
    console.log('[Service Worker] Background sync for images');
  }
});

// Push notifications (optional)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New update available!',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };
  
  event.waitUntil(
    self.registration.showNotification('EXIF Border', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});