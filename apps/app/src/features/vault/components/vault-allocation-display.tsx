'use client';

import type { VaultAllocation } from '@solana/mosaic-sdk';
import { apyBpsToString, blendedApyBps, allocateToYieldSources } from '@solana/mosaic-sdk';

interface Props {
    allocation: VaultAllocation;
    decimals?: number;
}

const TRANCHE_COLORS = {
    yieldFarm: 'bg-teal-500',
    reserve: 'bg-slate-400',
    crossBorder: 'bg-blue-500',
};

function fmt(n: bigint, decimals: number) {
    return (Number(n) / 10 ** decimals).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function VaultAllocationDisplay({ allocation, decimals = 6 }: Props) {
    const total = Number(allocation.totalBalance);
    const yieldPct = total > 0 ? (Number(allocation.yieldFarmAmount) / total) * 100 : 0;
    const reservePct = total > 0 ? (Number(allocation.reserveAmount) / total) * 100 : 0;
    const crossBorderPct = total > 0 ? (Number(allocation.crossBorderAmount) / total) * 100 : 0;

    const yieldAllocs = allocateToYieldSources(allocation.yieldFarmAmount, allocation.yieldAllocations.map(a => a.source));
    const blended = blendedApyBps(yieldAllocs, allocation.yieldFarmAmount);

    return (
        <div className="space-y-4">
            {/* Stacked bar */}
            <div className="flex h-4 w-full rounded-full overflow-hidden gap-0.5">
                <div
                    className={`${TRANCHE_COLORS.yieldFarm} transition-all`}
                    style={{ width: `${yieldPct}%` }}
                    title={`Yield Farm: ${yieldPct.toFixed(1)}%`}
                />
                <div
                    className={`${TRANCHE_COLORS.reserve} transition-all`}
                    style={{ width: `${reservePct}%` }}
                    title={`Reserve: ${reservePct.toFixed(1)}%`}
                />
                <div
                    className={`${TRANCHE_COLORS.crossBorder} transition-all`}
                    style={{ width: `${crossBorderPct}%` }}
                    title={`Cross-Border: ${crossBorderPct.toFixed(1)}%`}
                />
            </div>

            {/* Legend */}
            <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${TRANCHE_COLORS.yieldFarm}`} />
                        <span className="font-medium">Yield Farm</span>
                    </div>
                    <p className="text-muted-foreground">{fmt(allocation.yieldFarmAmount, decimals)}</p>
                    <p className="text-xs text-teal-600 font-medium">~{apyBpsToString(Math.round(blended))} blended</p>
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${TRANCHE_COLORS.reserve}`} />
                        <span className="font-medium">Reserve</span>
                    </div>
                    <p className="text-muted-foreground">{fmt(allocation.reserveAmount, decimals)}</p>
                    <p className="text-xs text-slate-500">treasury buffer</p>
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${TRANCHE_COLORS.crossBorder}`} />
                        <span className="font-medium">Cross-Border</span>
                    </div>
                    <p className="text-muted-foreground">{fmt(allocation.crossBorderAmount, decimals)}</p>
                    <p className="text-xs text-blue-600">instant settlement</p>
                </div>
            </div>

            {/* Yield sources breakdown */}
            {allocation.yieldAllocations.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Yield Sources</p>
                    {allocation.yieldAllocations.map(a => (
                        <div key={a.source.name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <span
                                    className={`inline-block h-2 w-2 rounded-full ${
                                        a.source.riskTier === 'low'
                                            ? 'bg-green-500'
                                            : a.source.riskTier === 'medium'
                                              ? 'bg-yellow-500'
                                              : 'bg-red-500'
                                    }`}
                                />
                                <span>{a.source.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <span>{apyBpsToString(a.source.apyBps)}</span>
                                <span>{fmt(a.amount, decimals)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
