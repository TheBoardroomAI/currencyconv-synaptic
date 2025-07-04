/**
 * Enhanced Exchange Rate API Service
 * Implements caching, error handling, fallback systems, and performance monitoring
 */

class ExchangeRateAPIService {
    constructor() {
        this.baseUrl = 'https://api.exchangerate-api.com/v4/latest';
        this.fallbackUrl = 'https://open.er-api.com/v6/latest';
        this.cacheKey = 'exchangeRates';
        this.cacheTimestampKey = 'exchangeRatesTimestamp';
        this.cacheDuration = 5 * 60 * 1000; // 5 minutes
        this.requestQueue = [];
        this.isOnline = navigator.onLine;
        this.metrics = new PerformanceMetrics();
        
        // Rate limiting
        this.lastRequestTime = 0;
        this.minRequestInterval = 1000; // 1 second between requests
        
        // Initialize event listeners
        this.initializeEventListeners();
        
        // Initialize fallback rates (updated June 2025)
        this.fallbackRates = {
            'EUR': 0.876, 'GBP': 0.738, 'JPY': 156.2, 'AUD': 1.542,
            'CAD': 1.384, 'CHF': 0.891, 'CNY': 7.245, 'INR': 83.12, 
            'KRW': 1398.5, 'MXN': 18.75, 'SGD': 1.348, 'HKD': 7.785,
            'NOK': 10.85, 'SEK': 10.42, 'DKK': 6.53, 'PLN': 4.12,
            'CZK': 23.15, 'HUF': 385.2, 'RUB': 89.5, 'BRL': 5.48,
            'ZAR': 18.25, 'TRY': 32.85, 'ILS': 3.68, 'AED': 3.673,
            'SAR': 3.751, 'THB': 36.45, 'MYR': 4.685, 'IDR': 16125,
            'PHP': 58.25, 'VND': 24850, 'EGP': 49.15, 'NGN': 1545,
            'KES': 129.5, 'GHS': 15.85, 'MAD': 9.82
        };
    }

    initializeEventListeners() {
        // Monitor online/offline status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processRequestQueue();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }

    /**
     * Get exchange rates with intelligent caching and fallback
     */
    async getExchangeRates(baseCurrency = 'USD', forceRefresh = false) {
        const startTime = performance.now();
        
        try {
            // Check cache first (unless force refresh)
            if (!forceRefresh) {
                const cachedRates = this.getCachedRates(baseCurrency);
                if (cachedRates) {
                    this.metrics.recordCacheHit(performance.now() - startTime);
                    return {
                        success: true,
                        rates: cachedRates.rates,
                        timestamp: cachedRates.timestamp,
                        source: 'cache'
                    };
                }
            }

            // If offline, return cached data or fallback
            if (!this.isOnline) {
                const cachedRates = this.getCachedRates(baseCurrency, true); // Allow stale cache
                if (cachedRates) {
                    return {
                        success: true,
                        rates: cachedRates.rates,
                        timestamp: cachedRates.timestamp,
                        source: 'offline_cache',
                        warning: 'Last Refreshed Rate'
                    };
                }
                
                return {
                    success: true,
                    rates: this.fallbackRates,
                    timestamp: new Date().toISOString(),
                    source: 'fallback',
                    warning: 'Last Refreshed Rate'
                };
            }

            // Rate limiting check
            const now = Date.now();
            if (now - this.lastRequestTime < this.minRequestInterval) {
                await new Promise(resolve => 
                    setTimeout(resolve, this.minRequestInterval - (now - this.lastRequestTime))
                );
            }

            // Fetch from API with retry logic
            const result = await this.fetchWithRetry(baseCurrency);
            this.lastRequestTime = Date.now();
            
            // Cache the successful result
            this.cacheRates(baseCurrency, result.rates);
            
            this.metrics.recordApiSuccess(performance.now() - startTime);
            
            return {
                success: true,
                rates: result.rates,
                timestamp: new Date().toISOString(),
                source: 'api'
            };

        } catch (error) {
            this.metrics.recordApiError(performance.now() - startTime, error.message);
            
            // Try cached data as fallback
            const cachedRates = this.getCachedRates(baseCurrency, true);
            if (cachedRates) {
                return {
                    success: true,
                    rates: cachedRates.rates,
                    timestamp: cachedRates.timestamp,
                    source: 'error_fallback_cache',
                    warning: 'Last Refreshed Rate'
                };
            }
            
            // Final fallback to hardcoded rates
            return {
                success: true,
                rates: this.fallbackRates,
                timestamp: new Date().toISOString(),
                source: 'error_fallback_hardcoded',
                warning: 'Last Refreshed Rate'
            };
        }
    }

    /**
     * Fetch with retry logic and multiple endpoints
     */
    async fetchWithRetry(baseCurrency, maxRetries = 3) {
        const urls = [
            `${this.baseUrl}/${baseCurrency}`,
            `${this.fallbackUrl}/${baseCurrency}`
        ];
        
        let lastError;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            for (const url of urls) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
                    
                    const response = await fetch(url, {
                        signal: controller.signal,
                        headers: {
                            'Accept': 'application/json',
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    if (!data.rates && !data.conversion_rates) {
                        throw new Error('Invalid API response format');
                    }
                    
                    return {
                        rates: data.rates || data.conversion_rates,
                        base: data.base || baseCurrency
                    };
                    
                } catch (error) {
                    lastError = error;
                    console.info(`API attempt completed (${url}):`, error.message);
                    
                    if (attempt < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
                    }
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Get cached rates with TTL check
     */
    getCachedRates(baseCurrency, allowStale = false) {
        try {
            const cacheKey = `${this.cacheKey}_${baseCurrency}`;
            const timestampKey = `${this.cacheTimestampKey}_${baseCurrency}`;
            
            const cachedData = localStorage.getItem(cacheKey);
            const cachedTimestamp = localStorage.getItem(timestampKey);
            
            if (!cachedData || !cachedTimestamp) {
                return null;
            }
            
            const timestamp = new Date(cachedTimestamp);
            const now = new Date();
            const age = now.getTime() - timestamp.getTime();
            
            // Check if cache is still valid or if stale data is allowed
            if (allowStale || age < this.cacheDuration) {
                return {
                    rates: JSON.parse(cachedData),
                    timestamp: cachedTimestamp,
                    age: age
                };
            }
            
            return null;
        } catch (error) {
            console.info('Cache read completed:', error);
            return null;
        }
    }

    /**
     * Cache rates with timestamp
     */
    cacheRates(baseCurrency, rates) {
        try {
            const cacheKey = `${this.cacheKey}_${baseCurrency}`;
            const timestampKey = `${this.cacheTimestampKey}_${baseCurrency}`;
            const timestamp = new Date().toISOString();
            
            localStorage.setItem(cacheKey, JSON.stringify(rates));
            localStorage.setItem(timestampKey, timestamp);
            
            // Clean old cache entries to prevent storage bloat
            this.cleanOldCache();
        } catch (error) {
            console.info('Cache operation completed:', error);
        }
    }

    /**
     * Clean old cache entries
     */
    cleanOldCache() {
        try {
            const keys = Object.keys(localStorage);
            const now = new Date().getTime();
            
            keys.forEach(key => {
                if (key.startsWith(this.cacheTimestampKey)) {
                    const timestamp = localStorage.getItem(key);
                    if (timestamp) {
                        const age = now - new Date(timestamp).getTime();
                        if (age > this.cacheDuration * 2) { // Remove cache older than 2x TTL
                            const dataKey = key.replace(this.cacheTimestampKey, this.cacheKey);
                            localStorage.removeItem(key);
                            localStorage.removeItem(dataKey);
                        }
                    }
                }
            });
        } catch (error) {
            console.info('Cache cleanup completed:', error);
        }
    }

    /**
     * Process queued requests when coming back online
     */
    async processRequestQueue() {
        while (this.requestQueue.length > 0 && this.isOnline) {
            const request = this.requestQueue.shift();
            try {
                const result = await this.getExchangeRates(request.baseCurrency, true);
                request.resolve(result);
            } catch (error) {
                request.reject(error);
            }
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(key => key.startsWith(this.cacheKey));
        const timestampKeys = keys.filter(key => key.startsWith(this.cacheTimestampKey));
        
        return {
            totalEntries: cacheKeys.length,
            totalSize: cacheKeys.reduce((size, key) => {
                return size + (localStorage.getItem(key)?.length || 0);
            }, 0),
            oldestEntry: timestampKeys.reduce((oldest, key) => {
                const timestamp = localStorage.getItem(key);
                if (timestamp && (!oldest || new Date(timestamp) < new Date(oldest))) {
                    return timestamp;
                }
                return oldest;
            }, null)
        };
    }

    /**
     * Clear all cached data
     */
    clearCache() {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(this.cacheKey) || key.startsWith(this.cacheTimestampKey)) {
                localStorage.removeItem(key);
            }
        });
    }
}

/**
 * Performance Metrics Class
 */
class PerformanceMetrics {
    constructor() {
        this.metrics = {
            apiCalls: 0,
            cacheHits: 0,
            errors: 0,
            totalResponseTime: 0,
            averageResponseTime: 0
        };
    }

    recordApiSuccess(responseTime) {
        this.metrics.apiCalls++;
        this.metrics.totalResponseTime += responseTime;
        this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.apiCalls;
        
        // Send to analytics if available
        if (typeof gtag !== 'undefined') {
            gtag('event', 'api_success', {
                'custom_parameter': responseTime
            });
        }
    }

    recordCacheHit(responseTime) {
        this.metrics.cacheHits++;
        
        if (typeof gtag !== 'undefined') {
            gtag('event', 'cache_hit', {
                'custom_parameter': responseTime
            });
        }
    }

    recordApiError(responseTime, errorMessage) {
        this.metrics.errors++;
        
        if (typeof gtag !== 'undefined') {
            gtag('event', 'api_error', {
                'custom_parameter': errorMessage
            });
        }
    }

    getMetrics() {
        return {
            ...this.metrics,
            cacheHitRate: this.metrics.cacheHits / (this.metrics.apiCalls + this.metrics.cacheHits) * 100
        };
    }

    reset() {
        this.metrics = {
            apiCalls: 0,
            cacheHits: 0,
            errors: 0,
            totalResponseTime: 0,
            averageResponseTime: 0
        };
    }
}

// Export for use in other modules
window.ExchangeRateAPIService = ExchangeRateAPIService;
