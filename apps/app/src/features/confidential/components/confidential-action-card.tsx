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
import { toDecimalAmount } from '../lib/format';

export interface ConfidentialActionValues {
    amount?: string;
    address?: string;
}

/**
 * What an operation runs against: the network, wallet and mint. A plan that
 * stopped part-way holds the RPC and signer it started with, so it may only
 * resume while the same ones are selected.
 */
export interface ConfidentialRunContext {
    /** Equal for two runs exactly when they target the same network, wallet and mint. */
    key: string;
    /** Shown when the selection no longer matches, e.g. `Devnet · 7xKX…gAsU`. */
    label: string;
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
    /** The current selection. Undefined while there is none (no wallet, no network). */
    runContext?: ConfidentialRunContext;
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
    runContext,
    onRun,
}: ConfidentialActionCardProps) {
    const { validateSolanaAddress } = useInputValidation();
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [signatures, setSignatures] = useState<Signature[]>([]);
    // The network the listed signatures were sent on, which the selection may
    // have moved away from since.
    const [signaturesCluster, setSignaturesCluster] = useState<string | undefined>();
    // Set when a multi-transaction plan stopped part-way: the confirmed
    // transactions stay listed, and this sends the rest of the same plan.
    const [partial, setPartial] = useState<{
        total: number;
        resume: ConfidentialPlanError['resume'];
        /** A sent transaction whose outcome is unknown; the resume settles it first. */
        unsettled?: Signature;
        /** What the plan ran against; resuming needs the same selection. */
        context?: ConfidentialRunContext;
    } | null>(null);

    const needsAmount = !!fields?.amount;
    const needsAddress = !!fields?.address;

    const addressValid = addressOptional && !address ? true : validateSolanaAddress(address);
    // The builders take an exact decimal string, never `1e-9`: see toDecimalAmount.
    const decimalAmount = needsAmount ? toDecimalAmount(amount) : null;
    const inputsValid = (!needsAmount || decimalAmount !== null) && (!needsAddress || addressValid);

    const execute = async (send: (onProgress: (current: number, total: number) => void) => Promise<Signature[]>) => {
        // Captured before sending: the selection can change while it runs.
        const context = runContext;
        const sentOn = clusterName;
        setIsLoading(true);
        setError(null);
        setPartial(null);
        setProgress(null);
        try {
            const sigs = await send((current, total) => setProgress({ current, total }));
            setSignatures(sigs);
            setSignaturesCluster(sentOn);
            if (needsAmount) setAmount('');
            if (needsAddress) setAddress('');
        } catch (err) {
            if (err instanceof ConfidentialPlanError) {
                setSignatures(err.signatures);
                setSignaturesCluster(sentOn);
                setPartial({ total: err.total, resume: err.resume, unsettled: err.unsettled, context });
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
                {
                    amount: needsAmount ? (decimalAmount ?? undefined) : undefined,
                    address: needsAddress && address ? address : undefined,
                },
                onProgress,
            ),
        );
    };

    const handleStartOver = () => {
        setPartial(null);
        setSignatures([]);
        setError(null);
    };

    // A resume sends the rest of the plan to the RPC and signer it started
    // with, so it waits until the same network, wallet and mint are selected.
    const resumeBlocked = !!partial && (!runContext || runContext.key !== partial.context?.key);

    const handleResume = () => {
        if (partial && !resumeBlocked) void execute(partial.resume);
    };

    return (
        <Card className="rounded-2xl py-5 gap-4">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0 px-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {stepNumber}
                </div>
                <div className="flex-1 pt-1">
                    <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary/60" />
                        <h3 className="font-semibold">{title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{description}</p>
                </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5 sm:pl-16">
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

                <div className="space-y-2">
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
                </div>

                {error && <p className="text-sm text-destructive break-words">{error}</p>}

                {partial && !isLoading && (
                    <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                            {partial.unsettled
                                ? `Transaction ${signatures.length + 1} of ${partial.total} was sent, but whether it landed is unknown. Resume checks it before sending anything new; Start over could send it twice.`
                                : `Stopped after ${signatures.length} of ${partial.total} transactions. The confirmed ones below are on chain; resume to send the remaining ${partial.total - signatures.length}, including the cleanup that reclaims proof account rent.`}
                        </p>
                        {partial.unsettled && (
                            <a
                                href={buildExplorerUrl(partial.unsettled, signaturesCluster)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-primary"
                            >
                                {partial.unsettled.slice(0, 8)}…{partial.unsettled.slice(-8)}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                        <div className="flex gap-2">
                            <Button
                                onClick={handleResume}
                                disabled={resumeBlocked}
                                variant="outline"
                                size="sm"
                                className="flex-1"
                            >
                                Resume ({signatures.length + 1}/{partial.total})
                            </Button>
                            {/* Running the step again builds a new plan; if its main
                                transaction already confirmed, that repeats it. */}
                            <Button onClick={handleStartOver} variant="ghost" size="sm">
                                Start over
                            </Button>
                        </div>
                        {resumeBlocked && (
                            <p className="text-xs text-muted-foreground">
                                {partial.context
                                    ? `This run used ${partial.context.label}. Switch back to it to resume.`
                                    : 'Reconnect the wallet and network this run used to resume.'}
                            </p>
                        )}
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
                                href={buildExplorerUrl(sig, signaturesCluster)}
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
