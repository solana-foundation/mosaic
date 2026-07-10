'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Eye, EyeOff, RefreshCw, AlertTriangle } from 'lucide-react';
import type { ConfidentialAccountState } from '@solana/mosaic-sdk/confidential';
import { formatRawAmount } from '../lib/format';

interface ConfidentialBalancePanelProps {
    state: ConfidentialAccountState | null;
    isConfigured: boolean;
    isRevealed: boolean;
    isLoading: boolean;
    error: string | null;
    canReveal: boolean;
    onReveal: () => void;
    onRefresh: () => void;
    decimals: number;
    symbol?: string;
    /** Formatted plaintext (non-confidential) SPL balance. */
    plaintextBalance: string | null;
    plaintextLoading: boolean;
}

/**
 * Read-only view of a confidential token account's state: the public (plaintext)
 * balance, the pending/available confidential balances (hidden until revealed
 * with a wallet signature), and the pending-credit counter. The pending vs.
 * available distinction is the core concept the demo teaches — deposits and
 * incoming transfers land in **pending** and must be **applied** before they
 * become spendable **available** balance.
 */
export function ConfidentialBalancePanel({
    state,
    isConfigured,
    isRevealed,
    isLoading,
    error,
    canReveal,
    onReveal,
    onRefresh,
    decimals,
    symbol,
    plaintextBalance,
    plaintextLoading,
}: ConfidentialBalancePanelProps) {
    const unit = symbol ? ` ${symbol}` : '';

    const counterAtMax =
        state != null && state.pendingBalanceCreditCounter >= state.maximumPendingBalanceCreditCounter;

    const available = state?.decrypted?.availableBalance;
    const pending = state?.decrypted?.pendingBalance;

    const renderConfidentialAmount = (amount: bigint | undefined) => {
        if (!isConfigured) return <span className="text-muted-foreground">—</span>;
        if (!isRevealed || amount === undefined) return <span className="font-mono text-muted-foreground">•••••</span>;
        return (
            <span className="font-mono font-semibold">
                {formatRawAmount(amount, decimals)}
                {unit}
            </span>
        );
    };

    return (
        <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Balances</CardTitle>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onRefresh}
                        disabled={isLoading}
                        title="Refresh"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    {isConfigured && !isRevealed && (
                        <Button variant="secondary" size="sm" onClick={onReveal} disabled={!canReveal || isLoading}>
                            <Eye className="h-4 w-4 mr-1.5" />
                            Reveal
                        </Button>
                    )}
                    {isRevealed && (
                        <Badge variant="outline" className="gap-1">
                            <EyeOff className="h-3 w-3" />
                            Revealed
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Configuration status */}
                <div className="flex items-center gap-2">
                    {isConfigured ? (
                        <>
                            <Badge variant="secondary">Configured</Badge>
                            {state?.approved ? (
                                <Badge variant="secondary">Approved</Badge>
                            ) : (
                                <Badge variant="destructive">Not approved</Badge>
                            )}
                        </>
                    ) : (
                        <Badge variant="outline">Not configured</Badge>
                    )}
                </div>

                {/* Balances grid */}
                <div className="grid grid-cols-1 gap-3">
                    <BalanceRow label="Public (non-confidential)">
                        {plaintextLoading ? (
                            <Spinner size={14} />
                        ) : (
                            <span className="font-mono font-semibold">
                                {plaintextBalance ?? '0'}
                                {unit}
                            </span>
                        )}
                    </BalanceRow>
                    <BalanceRow label="Confidential — pending" hint="Deposits & incoming transfers land here">
                        {renderConfidentialAmount(pending)}
                    </BalanceRow>
                    <BalanceRow label="Confidential — available" hint="Spendable after applying pending">
                        {renderConfidentialAmount(available)}
                    </BalanceRow>
                </div>

                {/* Pending-credit counter */}
                {isConfigured && state && (
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Pending credit counter</span>
                        <span className={`font-mono ${counterAtMax ? 'text-destructive font-semibold' : ''}`}>
                            {state.pendingBalanceCreditCounter.toString()} /{' '}
                            {state.maximumPendingBalanceCreditCounter.toString()}
                        </span>
                    </div>
                )}

                {counterAtMax && (
                    <div className="flex items-start gap-2 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                            Pending credit counter is at its maximum. Apply the pending balance before depositing or
                            receiving again.
                        </span>
                    </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
        </Card>
    );
}

function BalanceRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
                <p className="text-sm font-medium">{label}</p>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
            <div className="text-right">{children}</div>
        </div>
    );
}
