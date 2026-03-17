/**
 * /api/six-rates
 *
 * Server-side proxy for the SIX Financial Data Web API.
 * Keeps credentials (SIX_API_TOKEN / SIX_API_USERNAME/PASSWORD) out of
 * the browser bundle.
 *
 * GET /api/six-rates
 *   Returns current FX rates and precious metal prices for the
 *   VAULT_INSTRUMENT_SUBSCRIPTION list.
 *
 * GET /api/six-rates?tickers=EUR/USD,XAU/USD
 *   Returns rates for specific tickers only.
 *
 * Response shape:
 * {
 *   rates: { "EUR/USD": 1.0827, "XAU/USD": 2185.0, ... },
 *   meta: {
 *     fetchedAt: "2026-03-17T...",
 *     source: "six_live" | "simulated",
 *     instruments: [{ ticker, valor, bc, name, kind, bid?, ask?, timestamp }]
 *   }
 * }
 *
 * Required env vars (set in .env.local):
 *   SIX_API_BASE_URL   (default: https://api.six-group.com/api/findata/v1)
 *   SIX_API_TOKEN      (Bearer token — preferred)
 *   SIX_API_USERNAME   (Basic auth username — alternative)
 *   SIX_API_PASSWORD   (Basic auth password — alternative)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    getSixClient,
    VAULT_INSTRUMENT_SUBSCRIPTION,
    SIX_BY_TICKER,
    type SixPriceResponse,
} from '@solana/mosaic-sdk';

export const runtime = 'nodejs'; // needs Buffer for Basic auth encoding
export const revalidate = 30;    // Next.js ISR: re-fetch every 30 seconds

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const tickerParam = searchParams.get('tickers');

    // Resolve which instruments to fetch
    const instruments =
        tickerParam
            ? tickerParam
                .split(',')
                .map(t => SIX_BY_TICKER[t.trim().toUpperCase()])
                .filter(Boolean)
            : VAULT_INSTRUMENT_SUBSCRIPTION;

    if (instruments.length === 0) {
        return NextResponse.json({ error: 'No matching instruments found' }, { status: 400 });
    }

    const client = getSixClient();
    let batch: Record<string, SixPriceResponse>;

    try {
        batch = await client.fetchBatch(instruments);
    } catch (err) {
        return NextResponse.json(
            { error: `Failed to fetch SIX data: ${err instanceof Error ? err.message : String(err)}` },
            { status: 502 },
        );
    }

    // Build compact rates map and detailed instrument list
    const rates: Record<string, number> = {};
    const instrumentDetails: Array<{
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
    }> = [];

    let anyLive = false;

    for (const [ticker, resp] of Object.entries(batch)) {
        rates[ticker] = resp.price.value;
        if (!resp.simulated) anyLive = true;

        const inst = SIX_BY_TICKER[ticker];
        instrumentDetails.push({
            ticker,
            valor: resp.valor,
            bc: resp.bc,
            name: inst?.name ?? ticker,
            kind: inst?.kind ?? 'fx',
            price: resp.price.value,
            bid: resp.price.bid,
            ask: resp.price.ask,
            timestamp: resp.price.timestamp,
            simulated: resp.simulated,
        });
    }

    return NextResponse.json({
        rates,
        meta: {
            fetchedAt: new Date().toISOString(),
            source: anyLive ? 'six_live' : 'simulated',
            instruments: instrumentDetails,
        },
    });
}
