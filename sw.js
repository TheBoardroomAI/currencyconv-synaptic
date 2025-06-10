
const CACHE_NAME = 'currencyconv-v2-enhanced';
const API_CACHE_NAME = 'currencyconv-api-v2';
const STATIC_CACHE_NAME = 'currencyconv-static-v2';

const urlsToCache = [
  '/',
  '/index.html',
  '/js/apiService.js',
  '/js/currencyConverter.js',
  '/js/ui.js',
  '/css/enhanced-styles.css'
];

const apiUrls = [
  'https://api.exchangerate-api.com',
  'https://open.er-api.com'
];

// Install event - cache static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then(function(cache) {
        return cache.addAll(urlsToCache);
      }),
      caches.open(API_CACHE_NAME) // Initialize API cache
    ]).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== STATIC_CACHE_NAME && 
              cacheName !== API_CACHE_NAME && 
              cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - enhanced caching strategy
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);
  
  // Handle API requests with network-first strategy
  if (isApiRequest(url)) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  
  // Handle static assets with cache-first strategy
  event.respondWith(handleStaticRequest(event.request));
});

// Check if request is to exchange rate API
function isApiRequest(url) {
  return apiUrls.some(apiUrl => url.href.includes(apiUrl.replace('https://', '')));
}

// Handle API requests with network-first, cache fallback
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Clone response for caching
      const responseClone = networkResponse.clone();
      
      // Cache with TTL (5 minutes)
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cache-timestamp', Date.now().toString());
      headers.set('sw-cache-ttl', (5 * 60 * 1000).toString()); // 5 minutes
      
      const cachedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });
      
      cache.put(request, cachedResponse);
      return networkResponse;
    }
    
    throw new Error('Network response not ok');
    
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Check if cache is still valid
      const cacheTimestamp = cachedResponse.headers.get('sw-cache-timestamp');
      const cacheTTL = cachedResponse.headers.get('sw-cache-ttl');
      
      if (cacheTimestamp && cacheTTL) {
        const age = Date.now() - parseInt(cacheTimestamp);
        const ttl = parseInt(cacheTTL);
        
        if (age < ttl) {
          return cachedResponse;
        }
      }
      
      // Return stale cache with warning header
      const staleResponse = cachedResponse.clone();
      const headers = new Headers(staleResponse.headers);
      headers.set('sw-cache-stale', 'true');
      
      return new Response(staleResponse.body, {
        status: staleResponse.status,
        statusText: staleResponse.statusText,
        headers: headers
      });
    }
    
    // No cache available, return error response
    return new Response(JSON.stringify({
      error: 'Network unavailable and no cached data',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle static requests with cache-first strategy
async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return offline page or basic error for navigation requests
    if (request.mode === 'navigate') {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Offline - CurrencyConv</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .offline-message { max-width: 400px; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="offline-message">
            <h1>You're Offline</h1>
            <p>Please check your internet connection and try again.</p>
            <button onclick="window.location.reload()">Retry</button>
          </div>
        </body>
        </html>
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    throw error;
  }
}

// Background sync for updating cache when online
self.addEventListener('sync', function(event) {
  if (event.tag === 'background-sync-rates') {
    event.waitUntil(updateExchangeRates());
  }
});

// Update exchange rates in background
async function updateExchangeRates() {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (response.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put('https://api.exchangerate-api.com/v4/latest/USD', response.clone());
    }
  } catch (error) {
    console.log('Background sync failed:', error);
  }
}

// Message handling for cache management
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      Promise.all([
        caches.delete(API_CACHE_NAME),
        caches.delete(STATIC_CACHE_NAME)
      ]).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      getCacheSize().then(size => {
        event.ports[0].postMessage({ size: size });
      })
    );
  }
});

// Get total cache size
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }
  
  return totalSize;
}
