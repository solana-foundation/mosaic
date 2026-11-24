'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, type LucideIcon } from 'lucide-react';
import type { Signature } from '@solana/kit';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/shared/form/amount-input';
import { SolanaAddressInput } from '@/components/shared/form/solana-address-input';
import { useInputValidation } from '@/hooks/use-input-validation';
import { humanizeError } from '@/lib/errors';
import { buildExplorerUrl } from '@/lib/solana/explorer';
import { ConfidentialPlanError } from '../lib/execute-confidential-plan';

export interface ConfidentialActionValues {
    amount?: string;
    address?: string;
}

interface ConfidentialActionCardProps {
    stepNumber: number;
    title: string;
    description: string;
    icon: LucideIcon;
    actionLabel: string;
    /** Which inputs this step needs. */
    fields?: { amount?: boolean; address?: boolean };
    amountLabel?: string;
    amountSymbol?: string;
    addressLabel?: string;
    addressPlaceholder?: string;
    /** Allow the address field to be left blank (the step supplies a default). */
    addressOptional?: boolean;
    /** Disable the action with an explanatory note (e.g. prerequisite not met). */
    disabledReason?: string;
    /** Explorer cluster name for signature links. */
    clusterName?: string;
    /** Runs the operation; returns the transaction signatures. */
    onRun: (
        values: ConfidentialActionValues,
        onProgress: (current: number, total: number) => void,
    ) => Promise<Signature[]>;
}

export function ConfidentialActionCard({
    stepNumber,
    title,
    description,
    icon: Icon,
    actionLabel,
    fields,
    amountLabel = 'Amount',
    amountSymbol,
    addressLabel = 'Recipient address',
    addressPlaceholder = 'Enter recipient Solana address...',
    addressOptional,
    disabledReason,
    clusterName,
    onRun,
}: ConfidentialActionCardProps) {
    const { validateSolanaAddress, validateAmount } = useInputValidation();
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [signatures, setSignatures] = useState<Signature[]>([]);
    // Set when a multi-transaction plan stopped part-way: the confirmed
    // transactions stay listed, and this sends the rest of the same plan.
    const [partial, setPartial] = useState<{
        total: number;
        resume: ConfidentialPlanError['resume'];
        /** A sent transaction whose outcome is unknown; the resume settles it first. */
        unsettled?: Signature;
    } | null>(null);

    const needsAmount = !!fields?.amount;
    const needsAddress = !!fields?.address;

    const addressValid = addressOptional && !address ? true : validateSolanaAddress(address);
    const inputsValid = (!needsAmount || validateAmount(amount)) && (!needsAddress || addressValid);

    const execute = async (send: (onProgress: (current: number, total: number) => void) => Promise<Signature[]>) => {
        setIsLoading(true);
        setError(null);
        setPartial(null);
        setProgress(null);
        try {
            const sigs = await send((current, total) => setProgress({ current, total }));
            setSignatures(sigs);
            if (needsAmount) setAmount('');
            if (needsAddress) setAddress('');
        } catch (err) {
            if (err instanceof ConfidentialPlanError) {
                setSignatures(err.signatures);
                setPartial({ total: err.total, resume: err.resume, unsettled: err.unsettled });
                setError(humanizeError(err.cause));
            } else {
                setSignatures([]);
                setError(humanizeError(err));
            }
        } finally {
            setIsLoading(false);
            setProgress(null);
        }
    };

    const handleRun = () => {
        setSignatures([]);
        return execute(onProgress =>
            onRun(
                { amount: needsAmount ? amount : undefined, address: needsAddress && address ? address : undefined },
                onProgress,
            ),
        );
    };

    const handleStartOver = () => {
        setPartial(null);
        setSignatures([]);
        setError(null);
    };

    const handleResume = () => {
        if (partial) void execute(partial.resume);
    };

    return (
        <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {stepNumber}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary/60" />
                        <h3 className="font-semibold">{title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {needsAddress && (
                    <SolanaAddressInput
                        label={addressLabel}
                        value={address}
                        onChange={setAddress}
                        placeholder={addressPlaceholder}
                        disabled={isLoading}
                        required={!addressOptional}
                    />
                )}
                {needsAmount && (
                    <AmountInput
                        label={amountLabel}
                        value={amount}
                        onChange={setAmount}
                        disabled={isLoading}
                        balanceSymbol={amountSymbol}
                        required
                    />
                )}

                <Button
                    onClick={handleRun}
                    disabled={isLoading || !inputsValid || !!disabledReason || !!partial}
                    className="w-full"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {progress && progress.total > 1
                                ? `Sending ${progress.current}/${progress.total}...`
                                : 'Sending...'}
                        </>
                    ) : (
                        actionLabel
                    )}
                </Button>

                {disabledReason && !isLoading && <p className="text-xs text-muted-foreground">{disabledReason}</p>}

                {error && <p className="text-sm text-destructive break-words">{error}</p>}

                {partial && !isLoading && (
                    <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                            {partial.unsettled
                                ? `Transaction ${signatures.length + 1} of ${partial.total} was sent, but whether it landed is unknown. Resume checks it before sending anything new; Start over could send it twice.`
                                : `Stopped after ${signatures.length} of ${partial.total} transactions. The confirmed ones below are on chain; resume to send the remaining ${partial.total - signatures.length}, including the cleanup that reclaims proof account rent.`}
                        </p>
                        <div className="flex gap-2">
                            <Button onClick={handleResume} variant="outline" size="sm" className="flex-1">
                                Resume ({signatures.length + 1}/{partial.total})
                            </Button>
                            {/* Running the step again builds a new plan; if its main
                                transaction already confirmed, that repeats it. */}
                            <Button onClick={handleStartOver} variant="ghost" size="sm">
                                Start over
                            </Button>
                        </div>
                    </div>
                )}

                {/* Hidden while sending: a resume keeps the confirmed list, which
                    would otherwise read as a finished run. */}
                {signatures.length > 0 && !isLoading && (
                    <div className="space-y-1 rounded-xl border border-green-500/30 bg-green-500/5 p-3">
                        <p className="text-sm font-medium text-green-700 dark:text-green-400">
                            {partial
                                ? `Confirmed — ${signatures.length} of ${partial.total} transactions`
                                : `Success — ${signatures.length} transaction${signatures.length > 1 ? 's' : ''}`}
                        </p>
                        {signatures.map((sig, i) => (
                            <a
                                key={sig}
                                href={buildExplorerUrl(sig, clusterName)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-primary"
                            >
                                {signatures.length > 1 ? `${i + 1}. ` : ''}
                                {sig.slice(0, 8)}…{sig.slice(-8)}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
