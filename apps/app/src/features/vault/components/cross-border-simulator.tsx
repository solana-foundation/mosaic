'use client';

import { useState, useEffect } from 'react';
import { buildCrossBorderTransferMemo, getSimulatedFxRate } from '@solana/mosaic-sdk';
import type { SettlementRail } from '@solana/mosaic-sdk';
import { ArrowRight, Globe2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useSixRates, getRateFromCache } from '../hooks/use-six-rates';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'SGD', 'CHF', 'AED', 'HKD', 'CAD', 'AUD', 'ZAR', 'CNY', 'BRL', 'MXN'];
const METALS = ['XAU', 'XAG', 'XPD', 'XPT'];

const RAILS: { value: SettlementRail; label: string }[] = [
    { value: 'solana_spl',    label: 'Solana SPL (~1s)' },
    { value: 'sepa_sim',      label: 'SEPA Instant (~1h)' },
    { value: 'iso20022_sim',  label: 'ISO 20022 (~2h)' },
    { value: 'swift_sim',     label: 'SWIFT (T+1)' },
];

const TRAVEL_RULE_THRESHOLD = 1000;

// ─── Component ────────────────────────────────────────────────────────────────

export function CrossBorderSimulator() {
    const [amount, setAmount]         = useState('10000');
    const [srcCurrency, setSrcCurrency] = useState('USD');
    const [dstCurrency, setDstCurrency] = useState('EUR');
    const [rail, setRail]             = useState<SettlementRail>('solana_spl');
    const [senderBic, setSenderBic]   = useState('BOFAUS3N');
    const [receiverBic, setReceiverBic] = useState('DEUTDEDB');

    // SIX live rates
    const { rates, meta, loading, error, lastUpdated, refresh } = useSixRates();

    const decimals = 6;
    const amountNum = parseFloat(amount) || 0;
    const amountBaseUnits = BigInt(Math.floor(amountNum * 10 ** decimals));
    const thresholdBaseUnits = BigInt(Math.floor(TRAVEL_RULE_THRESHOLD * 10 ** decimals));

    // Use live rate if available, fall back to simulation
    const liveRate = getRateFromCache(rates, srcCurrency, dstCurrency);
    const fxRate = liveRate ?? getSimulatedFxRate(srcCurrency, dstCurrency);
    const isLive = liveRate !== null;
    const converted = (amountNum * fxRate).toFixed(2);

    const result = buildCrossBorderTransferMemo(
        {
            amount: amountBaseUnits,
            recipient: '11111111111111111111111111111111' as import('@solana/kit').Address,
            sourceCurrency: srcCurrency,
            destinationCurrency: dstCurrency,
            senderBic,
            receiverBic,
            purposeCode: 'TRAD',
            rail,
            fxRate, // pass the resolved rate so memo embeds it
        },
        thresholdBaseUnits,
    );

    // Metals section: show spot prices for reference
    const metalPrices = METALS
        .map(m => ({ symbol: m, price: rates[`${m}/USD`] }))
        .filter(m => m.price !== undefined);

    return (
        <div className="space-y-4">
            {/* SIX status bar */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                error
                    ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'
                    : isLive
                      ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'
                      : 'bg-muted text-muted-foreground'
            }`}>
                <div className="flex items-center gap-1.5">
                    {isLive ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                    {loading && !lastUpdated
                        ? 'Connecting to SIX Financial Data…'
                        : error
                          ? `SIX API unavailable — using simulated rates (${error.slice(0, 60)})`
                          : isLive
                            ? `Live SIX rates · updated ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}`
                            : 'Simulated rates (configure SIX_API_TOKEN in .env.local)'}
                </div>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="flex items-center gap-1 hover:opacity-70 disabled:opacity-40 transition-opacity"
                    title="Refresh rates"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Amount</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="rounded-md border px-3 py-2 text-sm bg-background"
                        min="0"
                        step="100"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Settlement Rail</label>
                    <select
                        value={rail}
                        onChange={e => setRail(e.target.value as SettlementRail)}
                        className="rounded-md border px-3 py-2 text-sm bg-background"
                    >
                        {RAILS.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Source Currency</label>
                    <select
                        value={srcCurrency}
                        onChange={e => setSrcCurrency(e.target.value)}
                        className="rounded-md border px-3 py-2 text-sm bg-background"
                    >
                        {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Destination Currency</label>
                    <select
                        value={dstCurrency}
                        onChange={e => setDstCurrency(e.target.value)}
                        className="rounded-md border px-3 py-2 text-sm bg-background"
                    >
                        {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Sender BIC (SWIFT)</label>
                    <input
                        type="text"
                        value={senderBic}
                        onChange={e => setSenderBic(e.target.value)}
                        className="rounded-md border px-3 py-2 text-sm bg-background font-mono"
                        placeholder="BOFAUS3N"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Receiver BIC (SWIFT)</label>
                    <input
                        type="text"
                        value={receiverBic}
                        onChange={e => setReceiverBic(e.target.value)}
                        className="rounded-md border px-3 py-2 text-sm bg-background font-mono"
                        placeholder="DEUTDEDB"
                    />
                </div>
            </div>

            {/* FX Summary */}
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="text-center">
                        <p className="text-2xl font-bold">{amountNum.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">{srcCurrency}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                            isLive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'
                        }`}>
                            {fxRate.toFixed(4)}
                            {isLive && ' ⚡'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            1 {srcCurrency} = {fxRate.toFixed(4)} {dstCurrency}
                        </span>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold">{parseFloat(converted).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">{dstCurrency}</p>
                    </div>
                </div>

                {/* Compliance badges */}
                <div className="flex flex-wrap gap-2">
                    {result.travelRuleAttached && (
                        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <Globe2 className="h-3 w-3" />
                            Travel Rule attached
                        </span>
                    )}
                    {!result.travelRuleAttached && (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Below Travel Rule threshold (${TRAVEL_RULE_THRESHOLD.toLocaleString()})
                        </span>
                    )}
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        Settlement: ~{result.settlementSeconds < 60
                            ? `${result.settlementSeconds}s`
                            : result.settlementSeconds < 3600
                              ? `${Math.round(result.settlementSeconds / 60)}m`
                              : `${Math.round(result.settlementSeconds / 3600)}h`}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                        isLive ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' : 'bg-muted text-muted-foreground'
                    }`}>
                        {isLive ? '⚡ SIX live rate' : 'Simulated rate'}
                    </span>
                </div>
            </div>

            {/* Precious metal spot prices (from SIX) */}
            {metalPrices.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        Precious Metal Spot Prices
                        {isLive && <span className="text-teal-600">⚡ SIX live</span>}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {metalPrices.map(({ symbol, price }) => (
                            <div key={symbol} className="rounded-md border p-2 text-center">
                                <p className="text-xs text-muted-foreground">{symbol}/USD</p>
                                <p className="text-sm font-bold">${price!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p className="text-xs text-muted-foreground">per troy oz</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Available FX rates from SIX */}
            {Object.keys(rates).filter(t => !t.startsWith('X')).length > 0 && (
                <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                        View all {Object.keys(rates).filter(t => !t.startsWith('X')).length} live FX rates from SIX
                    </summary>
                    <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-1 text-xs font-mono">
                        {Object.entries(rates)
                            .filter(([t]) => !t.startsWith('X'))
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([ticker, rate]) => (
                                <div key={ticker} className="flex justify-between gap-2 rounded bg-muted px-2 py-1">
                                    <span className="text-muted-foreground">{ticker}</span>
                                    <span>{rate.toFixed(4)}</span>
                                </div>
                            ))}
                    </div>
                </details>
            )}

            {/* Memo preview */}
            <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                    View SPL Memo payload
                </summary>
                <pre className="mt-2 rounded bg-muted p-3 overflow-x-auto text-xs leading-relaxed">
                    {JSON.stringify(JSON.parse(result.memoData), null, 2)}
                </pre>
            </details>
        </div>
    );
}
