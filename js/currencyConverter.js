
/**
 * Enhanced Currency Converter with React-like hooks pattern
 * Provides loading states, error handling, and offline support
 */

class CurrencyConverter {
    constructor() {
        this.apiService = new ExchangeRateAPIService();
        this.state = {
            loading: false,
            error: null,
            rates: {},
            lastUpdate: null,
            isOffline: !navigator.onLine
        };
        this.subscribers = [];
        this.debounceTimer = null;
        
        // Initialize
        this.initializeEventListeners();
        this.loadInitialRates();
    }

    /**
     * Subscribe to state changes (React-like pattern)
     */
    subscribe(callback) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(sub => sub !== callback);
        };
    }

    /**
     * Update state and notify subscribers
     */
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.subscribers.forEach(callback => callback(this.state));
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        window.addEventListener('online', () => {
            this.setState({ isOffline: false });
            this.refreshRates();
        });
        
        window.addEventListener('offline', () => {
            this.setState({ isOffline: true });
        });
    }

    /**
     * Load initial exchange rates
     */
    async loadInitialRates() {
        await this.fetchRates('USD');
    }

    /**
     * Fetch exchange rates with debouncing
     */
    async fetchRates(baseCurrency = 'USD', forceRefresh = false) {
        // Clear existing debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounce the API call
        return new Promise((resolve) => {
            this.debounceTimer = setTimeout(async () => {
                try {
                    this.setState({ loading: true, error: null });
                    
                    const result = await this.apiService.getExchangeRates(baseCurrency, forceRefresh);
                    
                    this.setState({
                        loading: false,
                        rates: result.rates,
                        lastUpdate: result.timestamp,
                        error: result.warning || null,
                        source: result.source
                    });
                    
                    resolve(result);
                } catch (error) {
                    this.setState({
                        loading: false,
                        error: `Failed to fetch exchange rates: ${error.message}`
                    });
                    resolve(null);
                }
            }, 300); // 300ms debounce
        });
    }

    /**
     * Convert currency with caching and error handling
     */
    async convertCurrency(amount, fromCurrency, toCurrency) {
        if (!amount || amount <= 0) {
            return {
                convertedAmount: 0,
                exchangeRate: 0,
                error: null
            };
        }

        try {
            // Ensure we have rates for the base currency
            if (!this.state.rates || Object.keys(this.state.rates).length === 0) {
                await this.fetchRates(fromCurrency);
            }

            let convertedAmount = 0;
            let exchangeRate = 0;

            if (fromCurrency === 'USD') {
                exchangeRate = this.state.rates[toCurrency] || 1;
                convertedAmount = amount * exchangeRate;
            } else if (toCurrency === 'USD') {
                exchangeRate = 1 / (this.state.rates[fromCurrency] || 1);
                convertedAmount = amount * exchangeRate;
            } else {
                // Convert through USD
                const fromRate = this.state.rates[fromCurrency] || 1;
                const toRate = this.state.rates[toCurrency] || 1;
                exchangeRate = toRate / fromRate;
                convertedAmount = amount * exchangeRate;
            }

            return {
                convertedAmount,
                exchangeRate,
                error: null,
                source: this.state.source,
                lastUpdate: this.state.lastUpdate
            };

        } catch (error) {
            return {
                convertedAmount: 0,
                exchangeRate: 0,
                error: error.message
            };
        }
    }

    /**
     * Get popular exchange rates
     */
    getPopularRates() {
        const popularPairs = [
            { from: 'USD', to: 'EUR', id: 'usdeur' },
            { from: 'USD', to: 'GBP', id: 'usdgbp' },
            { from: 'USD', to: 'JPY', id: 'usdjpy' },
            { from: 'EUR', to: 'GBP', id: 'eurgbp' },
            { from: 'GBP', to: 'USD', id: 'gbpusd' }
        ];

        return popularPairs.map(pair => {
            let rate = 0;
            
            if (pair.from === 'USD') {
                rate = this.state.rates[pair.to] || 0;
            } else if (pair.to === 'USD') {
                rate = 1 / (this.state.rates[pair.from] || 1);
            } else {
                const fromRate = this.state.rates[pair.from] || 1;
                const toRate = this.state.rates[pair.to] || 1;
                rate = toRate / fromRate;
            }

            return {
                ...pair,
                rate: this.formatCurrency(rate)
            };
        });
    }

    /**
     * Refresh rates manually
     */
    async refreshRates() {
        const fromCurrency = document.getElementById('fromCurrency')?.value || 'USD';
        await this.fetchRates(fromCurrency, true);
    }

    /**
     * Format currency with proper decimal places
     */
    formatCurrency(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            return '0.00';
        }
        
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        }).format(amount);
    }

    /**
     * Get current state
     */
    getState() {
        return this.state;
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        return this.apiService.metrics.getMetrics();
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.apiService.clearCache();
        this.setState({
            rates: {},
            lastUpdate: null,
            error: 'Cache cleared - fetching fresh data...'
        });
        this.loadInitialRates();
    }
}

// Export for global use
window.CurrencyConverter = CurrencyConverter;
