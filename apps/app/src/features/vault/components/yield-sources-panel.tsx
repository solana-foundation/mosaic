'use client';

import { DEFAULT_YIELD_SOURCES, apyBpsToString } from '@solana/mosaic-sdk';
import type { YieldSourceConfig } from '@solana/mosaic-sdk';
import { Zap } from 'lucide-react';

const RISK_BADGE: Record<YieldSourceConfig['riskTier'], string> = {
    low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const KIND_LABEL: Record<YieldSourceConfig['kind'], string> = {
    usx_yield_vault: 'Solstice Finance · Live',
    kamino: 'Kamino Finance',
    drift: 'Drift Protocol',
    rwa: 'Tokenized RWA',
    custom: 'Custom',
};

export function YieldSourcesPanel() {
    return (
        <div className="space-y-3">
            {DEFAULT_YIELD_SOURCES.map(source => {
                const isLive = source.kind === 'usx_yield_vault';
                return (
                    <div
                        key={source.name}
                        className={`flex items-center justify-between rounded-lg border p-3 gap-4 ${
                            isLive ? 'border-teal-300 bg-teal-50/50 dark:border-teal-800 dark:bg-teal-950/20' : ''
                        }`}
                    >
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">{source.name}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${RISK_BADGE[source.riskTier]}`}>
                                    {source.riskTier}
                                </span>
                                {isLive && (
                                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 font-medium">
                                        <Zap className="h-3 w-3" />
                                        Live
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground">{KIND_LABEL[source.kind]}</span>
                            {isLive && source.meta ? (
                                <span className="text-xs text-muted-foreground font-mono" title="eUSX receipt token mint">
                                    eUSX: {String(source.meta['receiptToken']).slice(0, 20)}…
                                </span>
                            ) : (
                                <span className="text-xs text-muted-foreground font-mono truncate" title={source.programAddress}>
                                    {source.programAddress.slice(0, 20)}…
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <span className={`text-lg font-bold ${isLive ? 'text-teal-600' : 'text-teal-600'}`}>
                                {apyBpsToString(source.apyBps)}
                            </span>
                            <span className="text-xs text-muted-foreground">{isLive ? 'net IRR' : 'APY'}</span>
                        </div>
                    </div>
                );
            })}

            <div className="rounded-lg bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 p-3 text-xs text-teal-700 dark:text-teal-400 space-y-1">
                <p className="font-semibold flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Solstice YieldVault Integration</p>
                <p>USDC/USDT → USX (mint) → eUSX (lock) earns ~11.5% net IRR via Solstice YieldVault.</p>
                <p className="text-teal-600 dark:text-teal-500">
                    Withdrawal: Unlock → 7-day cooldown → Withdraw → Redeem → USDC/USDT.
                    Server-side instructions via <code className="font-mono">/api/usx-instructions</code>.
                </p>
            </div>
        </div>
    );
}
