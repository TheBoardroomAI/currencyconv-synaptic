/**
 * Enhanced UI Controller with loading states and user feedback
 */

class UIController {
    constructor() {
        this.converter = new CurrencyConverter();
        this.elements = {};
        this.isInitialized = false;
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    /**
     * Initialize the UI controller
     */
    initialize() {
        this.cacheElements();
        this.setupEventListeners();
        this.subscribeToConverterState();
        this.populateCurrencySelects();
        this.isInitialized = true;
        
        // Show initial loading state
        this.showLoadingState(true);
    }

    /**
     * Cache DOM elements for better performance
     */
    cacheElements() {
        this.elements = {
            amount: document.getElementById('amount'),
            fromCurrency: document.getElementById('fromCurrency'),
            toCurrency: document.getElementById('toCurrency'),
            swapBtn: document.querySelector('.swap-btn'),
            loading: document.getElementById('loading'),
            errorMessage: document.getElementById('errorMessage'),
            resultSection: document.getElementById('resultSection'),
            resultAmount: document.getElementById('resultAmount'),
            resultDetails: document.getElementById('resultDetails'),
            exchangeRate: document.getElementById('exchangeRate'),
            popularRates: document.getElementById('popularRates')
        };
    }

    /**
     * Setup event listeners with debouncing
     */
    setupEventListeners() {
        // Amount input with debouncing
        this.elements.amount?.addEventListener('input', 
            this.debounce(() => this.handleConversion(), 300)
        );

        // Currency selectors
        this.elements.fromCurrency?.addEventListener('change', () => this.handleConversion());
        this.elements.toCurrency?.addEventListener('change', () => this.handleConversion());

        // Swap button
        this.elements.swapBtn?.addEventListener('click', () => this.swapCurrencies());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.refreshRates();
            }
        });

        // Add refresh button functionality
        this.addRefreshButton();
        
        // Add status indicator
        this.addStatusIndicator();
    }

    /**
     * Subscribe to converter state changes
     */
    subscribeToConverterState() {
        this.converter.subscribe((state) => {
            this.updateUIFromState(state);
        });
    }

    /**
     * Update UI based on converter state
     */
    updateUIFromState(state) {
        // Update loading state
        this.showLoadingState(state.loading);

        // Update error messages
        this.showError(state.error);

        // Update offline indicator
        this.updateOfflineIndicator(state.isOffline);

        // Update popular rates
        if (state.rates && Object.keys(state.rates).length > 0) {
            this.updatePopularRates();
        }

        // Update last update time
        this.updateLastUpdateTime(state.lastUpdate, state.source);

        // Trigger conversion if not loading
        if (!state.loading && this.isInitialized) {
            this.performConversion();
        }
    }

    /**
     * Handle currency conversion
     */
    async handleConversion() {
        if (!this.isInitialized) return;
        
        const amount = parseFloat(this.elements.amount?.value) || 0;
        const fromCurrency = this.elements.fromCurrency?.value || 'USD';
        const toCurrency = this.elements.toCurrency?.value || 'EUR';

        // Show loading for user feedback
        this.showConversionLoading(true);

        try {
            const result = await this.converter.convertCurrency(amount, fromCurrency, toCurrency);
            this.updateResult(result, fromCurrency, toCurrency);
        } catch (error) {
            this.showError(`Updating conversion: ${error.message}`);
        } finally {
            this.showConversionLoading(false);
        }
    }

    /**
     * Perform conversion without triggering new API calls
     */
    async performConversion() {
        const amount = parseFloat(this.elements.amount?.value) || 0;
        const fromCurrency = this.elements.fromCurrency?.value || 'USD';
        const toCurrency = this.elements.toCurrency?.value || 'EUR';

        const result = await this.converter.convertCurrency(amount, fromCurrency, toCurrency);
        this.updateResult(result, fromCurrency, toCurrency);
    }

    /**
     * Update conversion result display
     */
    updateResult(result, fromCurrency, toCurrency) {
        if (!this.elements.resultAmount || !this.elements.resultDetails || !this.elements.exchangeRate) {
            return;
        }

        this.elements.resultAmount.textContent = this.converter.formatCurrency(result.convertedAmount);
        this.elements.resultDetails.textContent = toCurrency;
        this.elements.exchangeRate.textContent = 
            `1 ${fromCurrency} = ${this.converter.formatCurrency(result.exchangeRate)} ${toCurrency}`;

        // Add source indicator
        if (result.source) {
            this.addSourceIndicator(result.source);
        }
    }

    /**
     * Populate currency select options
     */
    populateCurrencySelects() {
        const currencies = {
            'USD': 'US Dollar', 'EUR': 'Euro', 'GBP': 'British Pound', 'JPY': 'Japanese Yen',
            'AUD': 'Australian Dollar', 'CAD': 'Canadian Dollar', 'CHF': 'Swiss Franc', 'CNY': 'Chinese Yuan',
            'INR': 'Indian Rupee', 'KRW': 'South Korean Won', 'MXN': 'Mexican Peso', 'SGD': 'Singapore Dollar',
            'HKD': 'Hong Kong Dollar', 'NOK': 'Norwegian Krone', 'SEK': 'Swedish Krona', 'DKK': 'Danish Krone',
            'PLN': 'Polish Zloty', 'CZK': 'Czech Koruna', 'HUF': 'Hungarian Forint', 'RUB': 'Russian Ruble',
            'BRL': 'Brazilian Real', 'ZAR': 'South African Rand', 'TRY': 'Turkish Lira', 'ILS': 'Israeli Shekel',
            'AED': 'UAE Dirham', 'SAR': 'Saudi Riyal', 'THB': 'Thai Baht', 'MYR': 'Malaysian Ringgit',
            'IDR': 'Indonesian Rupiah', 'PHP': 'Philippine Peso', 'VND': 'Vietnamese Dong', 'EGP': 'Egyptian Pound',
            'NGN': 'Nigerian Naira', 'KES': 'Kenyan Shilling', 'GHS': 'Ghanaian Cedi', 'MAD': 'Moroccan Dirham'
        };

        const popularCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'INR', 'KRW'];
        
        // Add additional currencies to selects
        Object.keys(currencies).forEach(code => {
            if (!popularCurrencies.includes(code)) {
                const option1 = new Option(`${code} - ${currencies[code]}`, code);
                const option2 = new Option(`${code} - ${currencies[code]}`, code);
                this.elements.fromCurrency?.appendChild(option1);
                this.elements.toCurrency?.appendChild(option2);
            }
        });
    }

    /**
     * Swap currencies
     */
    swapCurrencies() {
        if (!this.elements.fromCurrency || !this.elements.toCurrency) return;

        const temp = this.elements.fromCurrency.value;
        this.elements.fromCurrency.value = this.elements.toCurrency.value;
        this.elements.toCurrency.value = temp;

        // Add visual feedback
        this.elements.swapBtn?.classList.add('rotating');
        setTimeout(() => {
            this.elements.swapBtn?.classList.remove('rotating');
        }, 300);

        this.handleConversion();
    }

    /**
     * Update popular rates display
     */
    updatePopularRates() {
        const popularRates = this.converter.getPopularRates();
        
        popularRates.forEach(rate => {
            const element = document.getElementById(rate.id);
            if (element) {
                element.textContent = rate.rate;
                element.classList.add('updated');
                setTimeout(() => element.classList.remove('updated'), 1000);
            }
        });
    }

    /**
     * Show/hide loading state
     */
    showLoadingState(show) {
        if (this.elements.loading) {
            this.elements.loading.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Show conversion loading (smaller indicator)
     */
    showConversionLoading(show) {
        if (show) {
            this.elements.resultAmount?.classList.add('loading-shimmer');
        } else {
            this.elements.resultAmount?.classList.remove('loading-shimmer');
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        if (!this.elements.errorMessage) return;

        if (message) {
            this.elements.errorMessage.textContent = message;
            this.elements.errorMessage.style.display = 'block';
            
            // Auto-hide status messages after 5 seconds
            if (message.includes('Refreshing') || message.includes('Updating') || message.includes('Last Refreshed')) {
                setTimeout(() => {
                    if (this.elements.errorMessage.textContent === message) {
                        this.elements.errorMessage.style.display = 'none';
                    }
                }, 5000);
            }
        } else {
            this.elements.errorMessage.style.display = 'none';
        }
    }

    /**
     * Add refresh button
     */
    addRefreshButton() {
        const refreshBtn = document.createElement('button');
        refreshBtn.innerHTML = '🔄';
        refreshBtn.className = 'refresh-btn';
        refreshBtn.title = 'Refresh rates (Ctrl+R)';
        refreshBtn.onclick = () => this.refreshRates();
        
        // Add to converter form
        const converterForm = document.querySelector('.converter-form');
        if (converterForm) {
            converterForm.appendChild(refreshBtn);
        }
    }

    /**
     * Add status indicator
     */
    addStatusIndicator() {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'statusIndicator';
        statusDiv.className = 'status-indicator';
        
        const converterForm = document.querySelector('.converter-form');
        if (converterForm) {
            converterForm.appendChild(statusDiv);
        }
    }

    /**
     * Update offline indicator
     */
    updateOfflineIndicator(isOffline) {
        const statusIndicator = document.getElementById('statusIndicator');
        if (!statusIndicator) return;

        if (isOffline) {
            statusIndicator.innerHTML = '📡 Offline - Using cached data';
            statusIndicator.className = 'status-indicator offline';
        } else {
            statusIndicator.innerHTML = '🟢 Online';
            statusIndicator.className = 'status-indicator online';
        }
    }

    /**
     * Update last update time
     */
    updateLastUpdateTime(timestamp, source) {
        const statusIndicator = document.getElementById('statusIndicator');
        if (!statusIndicator || !timestamp) return;

        const time = new Date(timestamp).toLocaleTimeString();
        const sourceText = source ? ` (${source})` : '';
        
        if (!navigator.onLine) return; // Don't update if offline

        statusIndicator.innerHTML += `<br><small>Last updated: ${time}${sourceText}</small>`;
    }

    /**
     * Add source indicator to result
     */
    addSourceIndicator(source) {
        let indicator = document.getElementById('sourceIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'sourceIndicator';
            indicator.className = 'source-indicator';
            this.elements.resultSection?.appendChild(indicator);
        }

        const sourceLabels = {
            'api': '🌐 Live data',
            'cache': '💾 Cached data',
            'offline_cache': '📱 Offline cache',
            'fallback': '🔄 Last Refreshed Rate',
            'error_fallback_cache': '🔄 Last Refreshed Rate',
            'error_fallback_hardcoded': '🔄 Last Refreshed Rate'
        };

        indicator.textContent = sourceLabels[source] || source;
        indicator.className = `source-indicator ${source}`;
    }

    /**
     * Refresh rates manually
     */
    async refreshRates() {
        this.showError('Refreshing exchange rates...');
        await this.converter.refreshRates();
        this.showError(''); // Clear the message
    }

    /**
     * Debounce utility function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Get performance metrics for debugging
     */
    getMetrics() {
        return this.converter.getMetrics();
    }

    /**
     * Clear cache (for debugging/admin)
     */
    clearCache() {
        this.converter.clearCache();
        this.showError('Cache cleared successfully');
    }
}

// Initialize UI when script loads
window.uiController = new UIController();

// Expose global functions for backward compatibility
window.swapCurrencies = () => window.uiController.swapCurrencies();
window.refreshRates = () => window.uiController.refreshRates();
window.clearCache = () => window.uiController.clearCache();
window.getMetrics = () => window.uiController.getMetrics();
