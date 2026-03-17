'use client';

import { DEFAULT_YIELD_SOURCES, apyBpsToString } from '@solana/mosaic-sdk';
import type { YieldSourceConfig } from '@solana/mosaic-sdk';

const RISK_BADGE: Record<YieldSourceConfig['riskTier'], string> = {
    low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const KIND_LABEL: Record<YieldSourceConfig['kind'], string> = {
    kamino: 'Kamino Finance',
    drift: 'Drift Protocol',
    rwa: 'Tokenized RWA',
    custom: 'Custom',
};

export function YieldSourcesPanel() {
    return (
        <div className="space-y-3">
            {DEFAULT_YIELD_SOURCES.map(source => (
                <div
                    key={source.name}
                    className="flex items-center justify-between rounded-lg border p-3 gap-4"
                >
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{source.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${RISK_BADGE[source.riskTier]}`}>
                                {source.riskTier}
                            </span>
                        </div>
                        <span className="text-xs text-muted-foreground">{KIND_LABEL[source.kind]}</span>
                        <span className="text-xs text-muted-foreground font-mono truncate" title={source.programAddress}>
                            {source.programAddress.slice(0, 20)}…
                        </span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-lg font-bold text-teal-600">{apyBpsToString(source.apyBps)}</span>
                        <span className="text-xs text-muted-foreground">APY</span>
                    </div>
                </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">
                APY values are simulated. Integrate Kamino/Drift APIs or Pyth price feeds for live rates.
            </p>
        </div>
    );
}
