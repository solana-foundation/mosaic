'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { updateLiveFxRates } from '@solana/mosaic-sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SixRatesMeta {
    fetchedAt: string;
    source: 'six_live' | 'simulated';
    instruments: Array<{
        ticker: string;
        valor: number;
        bc: number;
        name: string;
        kind: string;
        price: number;
        bid?: number;
        ask?: number;
        timestamp: string;
        simulated: boolean;
    }>;
}

export interface SixRatesState {
    rates: Record<string, number>;
    meta: SixRatesMeta | null;
    loading: boolean;
    error: string | null;
    lastUpdated: Date | null;
    /** Manually trigger a refetch */
    refresh: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000; // match server cache TTL

/**
 * Fetches live FX rates and precious metal prices from the SIX Financial Data
 * API via the server-side /api/six-rates proxy route.
 *
 * - Polls every 30 seconds (matching the server's SIX cache TTL)
 * - Populates the SDK's live rate cache via `updateLiveFxRates()`
 * - Falls back to simulated rates if the API is unavailable
 *
 * @param tickers - Specific tickers to fetch (omit for default vault subscription)
 */
export function useSixRates(tickers?: string[]): SixRatesState {
    const [rates, setRates] = useState<Record<string, number>>({});
    const [meta, setMeta] = useState<SixRatesMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const buildUrl = useCallback(() => {
        const base = '/api/six-rates';
        if (tickers && tickers.length > 0) {
            return `${base}?tickers=${tickers.join(',')}`;
        }
        return base;
    }, [tickers]);

    const fetchRates = useCallback(async () => {
        try {
            const res = await fetch(buildUrl(), { cache: 'no-store' });
            if (!res.ok) {
                const body = await res.text();
                throw new Error(`HTTP ${res.status}: ${body}`);
            }
            const data = await res.json() as { rates: Record<string, number>; meta: SixRatesMeta };

            setRates(data.rates);
            setMeta(data.meta);
            setError(null);
            setLastUpdated(new Date());

            // Populate SDK-level cache so cross-border.ts uses live rates
            updateLiveFxRates(data.rates);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            // Don't clear existing rates on transient errors
        } finally {
            setLoading(false);
        }
    }, [buildUrl]);

    useEffect(() => {
        void fetchRates();
        intervalRef.current = setInterval(() => void fetchRates(), POLL_INTERVAL_MS);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchRates]);

    return { rates, meta, loading, error, lastUpdated, refresh: fetchRates };
}

/**
 * Convenience: get a specific rate from a useSixRates result.
 * Handles direct and inverse pairs.
 */
export function getRateFromCache(
    rates: Record<string, number>,
    from: string,
    to: string,
): number | null {
    if (from === to) return 1.0;
    const direct = rates[`${from}/${to}`];
    if (direct !== undefined) return direct;
    const inverse = rates[`${to}/${from}`];
    if (inverse !== undefined) return 1 / inverse;
    return null;
}
