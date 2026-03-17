/**
 * SIX Financial Data – Web API Client
 *
 * Provides typed access to the SIX Web API for real-time FX rates and
 * precious metal spot prices. Used by the Treasury Vault to replace
 * simulated rates with institutional-grade market data.
 *
 * Authentication:
 *   The SIX Web API uses Basic Auth or Bearer tokens depending on the
 *   subscription type. Configure via environment variables:
 *     SIX_API_BASE_URL     – e.g. https://api.six-group.com/api/findata/v1
 *     SIX_API_USERNAME     – API username (for Basic Auth)
 *     SIX_API_PASSWORD     – API password (for Basic Auth)
 *     SIX_API_TOKEN        – Bearer token (if using token-based auth)
 *
 * Rate caching:
 *   Responses are cached for CACHE_TTL_MS (default: 30s) to avoid
 *   hammering the API on every component render. The cache is
 *   invalidated on the server side via the Next.js API route.
 *
 * Fallback:
 *   If the API is unavailable, `fetchRate()` falls back to the last known
 *   rate and logs a warning. Cold-start fallback uses getSimulatedFxRate().
 */

import type { SixInstrument } from './six-instruments';
import { getInstrumentByPair } from './six-instruments';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface SixClientConfig {
    /** SIX Web API base URL (no trailing slash) */
    baseUrl: string;
    /** API username for Basic Auth (mutually exclusive with token) */
    username?: string;
    /** API password for Basic Auth */
    password?: string;
    /** Bearer token (takes precedence over username/password) */
    token?: string;
    /** Cache TTL in milliseconds (default: 30_000) */
    cacheTtlMs?: number;
    /** Timeout per request in milliseconds (default: 5_000) */
    timeoutMs?: number;
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface SixPriceValue {
    /** Mid/last price */
    value: number;
    /** Bid price (if available) */
    bid?: number;
    /** Ask price (if available) */
    ask?: number;
    /** ISO-8601 price timestamp */
    timestamp: string;
    /** Currency of the quoted value */
    currency: string;
}

export interface SixPriceResponse {
    valor: number;
    bc: number;
    ticker: string;
    price: SixPriceValue;
    /** Whether this came from cache */
    cached: boolean;
    /** Whether this is a simulated fallback */
    simulated: boolean;
}

// ─── Batch request/response ───────────────────────────────────────────────────

export interface SixBatchRequest {
    instruments: SixInstrument[];
}

export type SixBatchResponse = Record<string, SixPriceResponse>; // keyed by ticker

// ─── Rate cache ───────────────────────────────────────────────────────────────

interface CacheEntry {
    response: SixPriceResponse;
    fetchedAt: number;
}

const _cache = new Map<string, CacheEntry>();

function getCached(valorBc: string, ttlMs: number): SixPriceResponse | null {
    const entry = _cache.get(valorBc);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > ttlMs) return null;
    return { ...entry.response, cached: true };
}

function setCache(valorBc: string, response: SixPriceResponse): void {
    _cache.set(valorBc, { response, fetchedAt: Date.now() });
}

// ─── SIX API Client ───────────────────────────────────────────────────────────

export class SixClient {
    private readonly cfg: Required<SixClientConfig>;

    constructor(config: SixClientConfig) {
        this.cfg = {
            baseUrl: config.baseUrl.replace(/\/$/, ''),
            username: config.username ?? '',
            password: config.password ?? '',
            token: config.token ?? '',
            cacheTtlMs: config.cacheTtlMs ?? 30_000,
            timeoutMs: config.timeoutMs ?? 5_000,
        };
    }

    private buildAuthHeader(): Record<string, string> {
        if (this.cfg.token) {
            return { Authorization: `Bearer ${this.cfg.token}` };
        }
        if (this.cfg.username && this.cfg.password) {
            const creds = Buffer.from(`${this.cfg.username}:${this.cfg.password}`).toString('base64');
            return { Authorization: `Basic ${creds}` };
        }
        return {};
    }

    /**
     * Fetches the latest price for a single instrument.
     *
     * SIX Web API endpoint (intraday last value):
     *   GET /price/intraday/value?valorId=<valor>&bc=<bc>
     *
     * Adjust the path if your subscription uses a different endpoint:
     *   /eod/value  – end-of-day prices
     *   /delayed/value – 15-min delayed
     *
     * @param instrument - SIX instrument descriptor
     * @returns SixPriceResponse
     */
    async fetchPrice(instrument: SixInstrument): Promise<SixPriceResponse> {
        const cacheKey = `${instrument.valor}_${instrument.bc}`;

        const cached = getCached(cacheKey, this.cfg.cacheTtlMs);
        if (cached) return cached;

        const url = `${this.cfg.baseUrl}/price/intraday/value?valorId=${instrument.valor}&bc=${instrument.bc}`;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

            const res = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    ...this.buildAuthHeader(),
                },
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!res.ok) {
                throw new Error(`SIX API HTTP ${res.status}: ${res.statusText}`);
            }

            const data = await res.json() as SixApiRawResponse;
            const response = mapRawResponse(instrument, data);
            setCache(cacheKey, response);
            return response;

        } catch (err) {
            // Return last known cached value (even if stale) or fall back to simulation
            const stale = _cache.get(cacheKey);
            if (stale) {
                console.warn(`[SIX] Failed to fetch ${instrument.ticker}: ${err}. Using stale cache.`);
                return { ...stale.response, cached: true };
            }

            console.warn(`[SIX] Failed to fetch ${instrument.ticker}: ${err}. Using simulated fallback.`);
            return simulateFallback(instrument);
        }
    }

    /**
     * Fetches prices for multiple instruments in parallel.
     * Respects cache — cached instruments do not generate API calls.
     *
     * @param instruments - Array of SIX instruments to fetch
     * @returns Map from ticker to SixPriceResponse
     */
    async fetchBatch(instruments: SixInstrument[]): Promise<SixBatchResponse> {
        const results = await Promise.all(instruments.map(i => this.fetchPrice(i)));
        return Object.fromEntries(results.map((r, idx) => [instruments[idx].ticker, r]));
    }

    /**
     * Convenience: get the mid price for a currency pair (e.g. EUR/USD).
     *
     * Handles inverse quotes: if the instrument is stored as USD/EUR,
     * the result is automatically inverted.
     *
     * @param base - Base currency (e.g. "EUR")
     * @param quote - Quote currency (e.g. "USD")
     * @returns Mid price, or null if no instrument found
     */
    async getFxRate(base: string, quote: string): Promise<number | null> {
        if (base === quote) return 1.0;

        const instrument = getInstrumentByPair(base, quote);
        if (!instrument) return null;

        const { price } = await this.fetchPrice(instrument);

        // If the stored instrument is in the inverse direction, invert the rate
        const isInverse = instrument.base === quote && instrument.quote === base;
        return isInverse ? 1 / price.value : price.value;
    }

    /** Clears the in-memory rate cache. */
    clearCache(): void {
        _cache.clear();
    }
}

// ─── Raw API response mapping ─────────────────────────────────────────────────

/**
 * SIX Web API raw response shape.
 * The exact field names depend on the API version and endpoint.
 * Adjust the mapping in `mapRawResponse()` if your subscription returns
 * a different schema.
 *
 * Typical SIX intraday/value response:
 * {
 *   "valor": 946681,
 *   "bc": 148,
 *   "latestTradePrice": { "value": 1.0827, "dateTime": "..." },
 *   "currency": "USD"
 * }
 */
interface SixApiRawResponse {
    valor?: number;
    bc?: number;
    // Various field names seen across SIX API versions:
    latestTradePrice?: { value: number; dateTime?: string; bid?: number; ask?: number };
    last?: { value: number; dateTime?: string };
    price?: number;
    bid?: number;
    ask?: number;
    currency?: string;
    dateTime?: string;
    // Allow any additional fields
    [key: string]: unknown;
}

function mapRawResponse(instrument: SixInstrument, raw: SixApiRawResponse): SixPriceResponse {
    // Try to extract value from multiple possible response shapes
    let value: number | undefined;
    let bid: number | undefined;
    let ask: number | undefined;
    let timestamp = new Date().toISOString();

    if (raw.latestTradePrice) {
        value = raw.latestTradePrice.value;
        bid = raw.latestTradePrice.bid;
        ask = raw.latestTradePrice.ask;
        if (raw.latestTradePrice.dateTime) timestamp = raw.latestTradePrice.dateTime;
    } else if (raw.last) {
        value = raw.last.value;
        if (raw.last.dateTime) timestamp = raw.last.dateTime;
    } else if (typeof raw.price === 'number') {
        value = raw.price;
        bid = raw.bid;
        ask = raw.ask;
        if (typeof raw.dateTime === 'string') timestamp = raw.dateTime;
    }

    if (value === undefined || isNaN(value) || value <= 0) {
        throw new Error(`SIX API: unexpected response shape for ${instrument.ticker}`);
    }

    return {
        valor: instrument.valor,
        bc: instrument.bc,
        ticker: instrument.ticker,
        price: {
            value,
            bid,
            ask,
            timestamp,
            currency: (typeof raw.currency === 'string' ? raw.currency : instrument.quote) as string,
        },
        cached: false,
        simulated: false,
    };
}

// ─── Simulated fallback ───────────────────────────────────────────────────────

/** Last-resort simulated rates when the SIX API is unreachable */
const FALLBACK_RATES: Record<string, number> = {
    'EUR/USD': 1.0827, 'GBP/USD': 1.2710, 'USD/JPY': 151.20,
    'USD/CHF': 0.8900, 'USD/SGD': 1.3550, 'USD/AED': 3.6725,
    'USD/HKD': 7.8100, 'USD/CAD': 1.3640, 'USD/AUD': 1.5610,
    'USD/ZAR': 18.650, 'USD/CNY': 7.2430, 'USD/BRL': 5.0450,
    'USD/MXN': 17.150, 'USD/KRW': 1337.0, 'USD/ARS': 875.00,
    'USD/INR': 83.450, 'EUR/CHF': 0.9644, 'EUR/GBP': 0.8519, 'EUR/JPY': 163.7,
    'XAU/USD': 2185.0, 'XAG/USD': 24.50, 'XPD/USD': 980.0, 'XPT/USD': 885.0,
};

function simulateFallback(instrument: SixInstrument): SixPriceResponse {
    const rate = FALLBACK_RATES[instrument.ticker] ?? 1.0;
    return {
        valor: instrument.valor,
        bc: instrument.bc,
        ticker: instrument.ticker,
        price: {
            value: rate,
            timestamp: new Date().toISOString(),
            currency: instrument.quote,
        },
        cached: false,
        simulated: true,
    };
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _instance: SixClient | null = null;

/**
 * Returns a cached SixClient singleton configured from environment variables.
 * Safe to call on the server side (Node.js).
 *
 * Required env vars (at least one auth method):
 *   SIX_API_BASE_URL   – e.g. https://api.six-group.com/api/findata/v1
 *   SIX_API_TOKEN      – Bearer token (preferred)
 *   SIX_API_USERNAME   – Basic auth username
 *   SIX_API_PASSWORD   – Basic auth password
 */
export function getSixClient(): SixClient {
    if (_instance) return _instance;

    const baseUrl =
        (typeof process !== 'undefined' && process.env['SIX_API_BASE_URL']) ||
        'https://api.six-group.com/api/findata/v1';

    _instance = new SixClient({
        baseUrl,
        token:    typeof process !== 'undefined' ? process.env['SIX_API_TOKEN'] : undefined,
        username: typeof process !== 'undefined' ? process.env['SIX_API_USERNAME'] : undefined,
        password: typeof process !== 'undefined' ? process.env['SIX_API_PASSWORD'] : undefined,
        cacheTtlMs: 30_000, // 30 seconds
    });

    return _instance;
}
