'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { TokenDisplay } from '@/types/token';
import { useConnector } from '@solana/connector/react';
import { type Address, createSolanaRpc, type Rpc, type SolanaRpcApi } from '@solana/kit';
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
    CONFIDENTIAL_TRANSFER_UNSUPPORTED_WALLET_MESSAGE,
    createApplyConfidentialPendingBalanceTransaction,
    createApproveConfidentialTransferAccountTransaction,
    createConfigureConfidentialTransferAccountTransaction,
    createConfidentialDepositTransaction,
    createConfidentialFeeWithdrawOperationPlan,
    createConfidentialTransferPlan,
    createConfidentialTransferOperationPlan,
    createConfidentialTransferWithFeePlan,
    createConfidentialWithdrawTransaction,
    createEmptyConfidentialTransferAccountTransaction,
    createHarvestConfidentialTransferFeesTransaction,
    createSetConfidentialCreditsTransaction,
    createSetNonConfidentialCreditsTransaction,
    createSingleTransactionConfidentialOperationPlan,
    createUpdateConfidentialTransferMintTransaction,
    createWithdrawConfidentialTransferFeesFromAccountsPlan,
    createWithdrawConfidentialTransferFeesFromMintPlan,
    getConfidentialTransferFeeCapability,
    getConfidentialTransferAccountSnapshot,
    parseConfidentialTransferAddress,
    parseConfidentialTransferSourceAccounts,
    parseOptionalConfidentialTransferAddress,
    type ConfidentialOperationPlan,
    type ConfidentialTransferAccountSnapshot,
    type FullTransaction,
} from '@solana/mosaic-sdk';
import {
    executeMultiTransactionAction,
    type MultiTransactionProgress,
} from '@/features/token-management/lib/token-action';
import { getRpcUrl } from '@/lib/solana/rpc';
import { useConnectorConfidentialTransferSigner } from '@/features/wallet/hooks/use-connector-signer';
import { Badge } from '@/components/ui/badge';
import { Ban, CheckCircle2, Eye, Info, RotateCw, Send, Settings2, ShieldCheck, WalletCards } from 'lucide-react';

function hasExtension(token: TokenDisplay, ...names: string[]): boolean {
    const extensions = token.extensions ?? [];
    return names.some(name => extensions.includes(name));
}

function progressText(progress: MultiTransactionProgress): string {
    if (progress.status === 'confirmed') {
        return progress.signature ? `Confirmed ${progress.signature.slice(0, 10)}...` : 'Confirmed';
    }
    if (progress.status === 'failed') {
        return progress.error ?? 'Failed';
    }
    return progress.status === 'signing' ? 'Signing' : 'Sending';
}

function formatTokenAmount(rawAmount: bigint | null | undefined, decimals?: number): string {
    if (rawAmount === null || rawAmount === undefined) {
        return '-';
    }

    const tokenDecimals = Number.isInteger(decimals) && decimals !== undefined && decimals > 0 ? decimals : 0;
    if (tokenDecimals === 0) {
        return rawAmount.toLocaleString('en-US');
    }

    const divisor = 10n ** BigInt(tokenDecimals);
    const whole = rawAmount / divisor;
    const fraction = rawAmount % divisor;
    const fractionText = fraction.toString().padStart(tokenDecimals, '0').replace(/0+$/, '');

    return fractionText ? `${whole.toLocaleString('en-US')}.${fractionText}` : whole.toLocaleString('en-US');
}

export function ConfidentialTransferPanel({ token }: { token: TokenDisplay }) {
    const { selectedAccount, cluster } = useConnector();
    const { signer, transactionSigner, canSignMessages } = useConnectorConfidentialTransferSigner();
    const [tokenAccountOverride, setTokenAccountOverride] = useState('');
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [sources, setSources] = useState('');
    const [auditorElgamalPubkey, setAuditorElgamalPubkey] = useState('');
    const [autoApprove, setAutoApprove] = useState(false);
    const [useFeePlan, setUseFeePlan] = useState(false);
    const [snapshot, setSnapshot] = useState<ConfidentialTransferAccountSnapshot | null>(null);
    const [progress, setProgress] = useState<MultiTransactionProgress[]>([]);
    const [error, setError] = useState('');
    const [cleanupError, setCleanupError] = useState('');
    const [busy, setBusy] = useState(false);
    const [derivedTokenAccount, setDerivedTokenAccount] = useState<Address | null>(null);

    const mint = token.address as Address;
    const owner = selectedAccount as Address | undefined;
    const hasConfidentialFees =
        hasExtension(token, 'ConfidentialTransferFee') ||
        (hasExtension(token, 'ConfidentialTransferMint') && hasExtension(token, 'TransferFeeConfig'));
    const status = snapshot?.status ?? null;
    const balances = snapshot?.balances ?? null;
    const publicBalance = balances?.publicBalance ?? status?.publicBalance ?? null;
    const actions = snapshot?.availableActions ?? null;
    const feeCapability = useMemo(() => getConfidentialTransferFeeCapability(), []);
    const transferWithFeeSupported = feeCapability.transferWithFee.supported;
    const sourceAccountsEntered = sources.trim().length > 0;
    const tokenAccountOverrideText = tokenAccountOverride.trim();
    const hasCustomTokenAccountOverride = Boolean(tokenAccountOverrideText && tokenAccountOverrideText !== owner);
    const hasTokenAccountTarget = Boolean(hasCustomTokenAccountOverride || status?.tokenAccount || derivedTokenAccount);
    const feeWithdrawSupported = sourceAccountsEntered
        ? feeCapability.withdrawWithheldFeesFromAccounts.supported
        : feeCapability.withdrawWithheldFeesFromMint.supported;
    const activeRpcUrl = useMemo(() => (cluster?.url ? getRpcUrl(cluster.url) : undefined), [cluster?.url]);
    const displayedTokenAccount = hasCustomTokenAccountOverride
        ? tokenAccountOverrideText
        : status?.tokenAccount || derivedTokenAccount;

    const rpc = useMemo<Rpc<SolanaRpcApi> | null>(() => {
        if (!activeRpcUrl) return null;
        return createSolanaRpc(activeRpcUrl) as Rpc<SolanaRpcApi>;
    }, [activeRpcUrl]);

    const resetRunState = () => {
        setError('');
        setCleanupError('');
        setProgress([]);
    };

    const readSnapshot = async (input?: { includeBalances?: boolean }) => {
        const context = requireRpcOwner();
        return getConfidentialTransferAccountSnapshot({
            rpc: context.rpc,
            mint,
            owner: context.owner,
            authority: input?.includeBalances ? requireConfidentialSigner() : undefined,
            tokenAccount: getTokenAccountOverrideInput(),
        });
    };

    const refreshSnapshotAfterAction = async () => {
        try {
            setSnapshot(await readSnapshot({ includeBalances: Boolean(signer) }));
        } catch (err) {
            setError(
                err instanceof Error ? `Action confirmed, but refresh failed: ${err.message}` : 'Action confirmed',
            );
        }
    };

    const run = async (buildPlan: () => Promise<ConfidentialOperationPlan>) => {
        if (!activeRpcUrl) {
            setError('RPC unavailable');
            return;
        }

        setBusy(true);
        resetRunState();
        try {
            const plan = await buildPlan();
            const result = await executeMultiTransactionAction({
                plan,
                rpcUrl: activeRpcUrl,
                onProgress: next => {
                    setProgress(previous => {
                        const copy = [...previous];
                        copy[next.index - 1] = next;
                        return copy;
                    });
                },
            });
            setCleanupError(result.cleanupError ?? '');
            await refreshSnapshotAfterAction();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Action failed');
        } finally {
            setBusy(false);
        }
    };

    const requireRpcOwner = (): { rpc: Rpc<SolanaRpcApi>; owner: Address } => {
        if (!rpc || !owner) {
            throw new Error('Wallet or RPC unavailable');
        }
        return { rpc, owner };
    };

    const requireConfidentialSigner = () => {
        if (!signer) {
            throw new Error(CONFIDENTIAL_TRANSFER_UNSUPPORTED_WALLET_MESSAGE);
        }
        return signer;
    };

    const isActionAvailable = (action: keyof ConfidentialTransferAccountSnapshot['availableActions']) =>
        Boolean(actions?.[action]);

    const getTokenAccountOverrideInput = () => {
        const parsedTokenAccount = parseOptionalConfidentialTransferAddress(
            tokenAccountOverride,
            'token account override',
        );
        return parsedTokenAccount === owner ? undefined : parsedTokenAccount;
    };

    const getTokenAccountInput = () =>
        getTokenAccountOverrideInput() ?? status?.tokenAccount ?? derivedTokenAccount ?? undefined;

    const requireTokenAccountInput = () => {
        const resolvedTokenAccount = getTokenAccountInput();
        if (!resolvedTokenAccount) {
            throw new Error('Token account is required');
        }
        return resolvedTokenAccount;
    };

    const buildSinglePlan = (label: string, transaction: FullTransaction): ConfidentialOperationPlan =>
        createSingleTransactionConfidentialOperationPlan({ label, transaction });

    const refreshStatus = async () => {
        resetRunState();
        try {
            setSnapshot(await readSnapshot());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to read account status');
        }
    };

    useEffect(() => {
        if (!owner) {
            setDerivedTokenAccount(null);
            return;
        }

        setDerivedTokenAccount(null);
        let cancelled = false;
        const deriveTokenAccount = async () => {
            const [tokenAccount] = await findAssociatedTokenPda({
                owner,
                mint,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            });
            if (!cancelled) {
                setDerivedTokenAccount(tokenAccount);
            }
        };

        void deriveTokenAccount();
        return () => {
            cancelled = true;
        };
    }, [mint, owner]);

    useEffect(() => {
        if (!rpc || !owner || tokenAccountOverride.trim()) {
            return;
        }

        let cancelled = false;
        const loadDefaultAccountStatus = async () => {
            try {
                const nextSnapshot = await getConfidentialTransferAccountSnapshot({
                    rpc,
                    mint,
                    owner,
                });
                if (!cancelled) {
                    setSnapshot(nextSnapshot);
                }
            } catch {
                if (!cancelled) {
                    setSnapshot(null);
                }
            }
        };

        void loadDefaultAccountStatus();
        return () => {
            cancelled = true;
        };
    }, [mint, owner, rpc, tokenAccountOverride]);

    useEffect(() => {
        setSnapshot(null);
    }, [mint, owner, tokenAccountOverride]);

    const refreshBalances = async () => {
        resetRunState();
        try {
            setSnapshot(await readSnapshot({ includeBalances: true }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to read balances');
        }
    };

    const runConfigure = () =>
        run(async () => {
            const context = requireRpcOwner();
            const confidentialSigner = requireConfidentialSigner();
            const result = await createConfigureConfidentialTransferAccountTransaction({
                rpc: context.rpc,
                mint,
                owner: context.owner,
                authority: confidentialSigner,
                feePayer: confidentialSigner,
                tokenAccount: getTokenAccountOverrideInput(),
            });
            return buildSinglePlan('Configure account', result.transaction);
        });

    const runApprove = () =>
        run(async () => {
            const context = requireRpcOwner();
            if (!transactionSigner) throw new Error('Wallet unavailable');
            const transaction = await createApproveConfidentialTransferAccountTransaction({
                rpc: context.rpc,
                mint,
                tokenAccount: requireTokenAccountInput(),
                authority: transactionSigner,
                feePayer: transactionSigner,
            });
            return buildSinglePlan('Approve account', transaction);
        });

    const runDeposit = () =>
        run(async () => {
            const context = requireRpcOwner();
            if (!transactionSigner) throw new Error('Wallet unavailable');
            const transaction = await createConfidentialDepositTransaction({
                rpc: context.rpc,
                mint,
                owner: context.owner,
                authority: transactionSigner,
                feePayer: transactionSigner,
                amount,
                tokenAccount: getTokenAccountInput(),
            });
            return buildSinglePlan('Deposit', transaction);
        });

    const runApplyPending = () =>
        run(async () => {
            const context = requireRpcOwner();
            const confidentialSigner = requireConfidentialSigner();
            const transaction = await createApplyConfidentialPendingBalanceTransaction({
                rpc: context.rpc,
                mint,
                owner: context.owner,
                authority: confidentialSigner,
                feePayer: confidentialSigner,
                tokenAccount: getTokenAccountInput(),
            });
            return buildSinglePlan('Apply pending', transaction);
        });

    const runWithdraw = () =>
        run(async () => {
            const context = requireRpcOwner();
            const confidentialSigner = requireConfidentialSigner();
            const transaction = await createConfidentialWithdrawTransaction({
                rpc: context.rpc,
                mint,
                owner: context.owner,
                authority: confidentialSigner,
                feePayer: confidentialSigner,
                amount,
                tokenAccount: getTokenAccountInput(),
            });
            return buildSinglePlan('Withdraw', transaction);
        });

    const runTransfer = () =>
        run(async () => {
            const context = requireRpcOwner();
            const confidentialSigner = requireConfidentialSigner();
            const input = {
                rpc: context.rpc,
                mint,
                from: context.owner,
                to: parseConfidentialTransferAddress(recipient, 'recipient'),
                authority: confidentialSigner,
                feePayer: confidentialSigner,
                amount,
                sourceTokenAccount: getTokenAccountInput(),
            };
            if (useFeePlan && !feeCapability.transferWithFee.supported) {
                throw new Error(feeCapability.transferWithFee.reason);
            }
            const plan = useFeePlan
                ? await createConfidentialTransferWithFeePlan(input)
                : await createConfidentialTransferPlan(input);
            return createConfidentialTransferOperationPlan(plan);
        });

    const runEmptyAccount = () =>
        run(async () => {
            const context = requireRpcOwner();
            const confidentialSigner = requireConfidentialSigner();
            const transaction = await createEmptyConfidentialTransferAccountTransaction({
                rpc: context.rpc,
                mint,
                owner: context.owner,
                authority: confidentialSigner,
                feePayer: confidentialSigner,
                tokenAccount: getTokenAccountInput(),
            });
            return buildSinglePlan('Empty account', transaction);
        });

    const runSetCredits = (kind: 'confidential' | 'non-confidential', enabled: boolean) =>
        run(async () => {
            const context = requireRpcOwner();
            if (!transactionSigner) throw new Error('Wallet unavailable');
            const transaction =
                kind === 'confidential'
                    ? await createSetConfidentialCreditsTransaction({
                          rpc: context.rpc,
                          tokenAccount: requireTokenAccountInput(),
                          authority: transactionSigner,
                          feePayer: transactionSigner,
                          enabled,
                      })
                    : await createSetNonConfidentialCreditsTransaction({
                          rpc: context.rpc,
                          tokenAccount: requireTokenAccountInput(),
                          authority: transactionSigner,
                          feePayer: transactionSigner,
                          enabled,
                      });
            return buildSinglePlan(`${enabled ? 'Enable' : 'Disable'} ${kind} credits`, transaction);
        });

    const runUpdateMint = () =>
        run(async () => {
            const context = requireRpcOwner();
            if (!transactionSigner) throw new Error('Wallet unavailable');
            const transaction = await createUpdateConfidentialTransferMintTransaction({
                rpc: context.rpc,
                mint,
                authority: transactionSigner,
                feePayer: transactionSigner,
                autoApproveNewAccounts: autoApprove,
                auditorElgamalPubkey:
                    parseOptionalConfidentialTransferAddress(auditorElgamalPubkey, 'auditor ElGamal pubkey') ?? null,
            });
            return buildSinglePlan('Update mint', transaction);
        });

    const runHarvestFees = () =>
        run(async () => {
            const context = requireRpcOwner();
            if (!transactionSigner) throw new Error('Wallet unavailable');
            const transaction = await createHarvestConfidentialTransferFeesTransaction({
                rpc: context.rpc,
                mint,
                sources: parseConfidentialTransferSourceAccounts(sources, {
                    required: true,
                    name: 'source token account',
                }),
                feePayer: transactionSigner,
            });
            return buildSinglePlan('Harvest fees', transaction);
        });

    const runWithdrawFees = () =>
        run(async () => {
            const context = requireRpcOwner();
            const confidentialSigner = requireConfidentialSigner();
            const sourceAccounts = parseConfidentialTransferSourceAccounts(sources, {
                name: 'source token account',
            });
            const input = {
                rpc: context.rpc,
                mint,
                destinationTokenAccount: requireTokenAccountInput(),
                authority: confidentialSigner,
                feePayer: confidentialSigner,
            };
            if (sourceAccounts.length > 0 && !feeCapability.withdrawWithheldFeesFromAccounts.supported) {
                throw new Error(feeCapability.withdrawWithheldFeesFromAccounts.reason);
            }
            if (sourceAccounts.length === 0 && !feeCapability.withdrawWithheldFeesFromMint.supported) {
                throw new Error(feeCapability.withdrawWithheldFeesFromMint.reason);
            }
            const plan =
                sourceAccounts.length > 0
                    ? await createWithdrawConfidentialTransferFeesFromAccountsPlan({
                          ...input,
                          sources: sourceAccounts,
                      })
                    : await createWithdrawConfidentialTransferFeesFromMintPlan(input);
            return createConfidentialFeeWithdrawOperationPlan(plan);
        });

    if (!mint) {
        return null;
    }

    return (
        <div className="space-y-4">
            {!canSignMessages && (
                <Alert variant="warning">
                    <Ban className="h-4 w-4" />
                    <AlertDescription>{CONFIDENTIAL_TRANSFER_UNSUPPORTED_WALLET_MESSAGE}</AlertDescription>
                </Alert>
            )}
            {error && (
                <Alert variant="destructive">
                    <Ban className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {cleanupError && (
                <Alert variant="warning">
                    <Ban className="h-4 w-4" />
                    <AlertDescription>Cleanup failed: {cleanupError}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <section className="rounded-lg border bg-card p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-semibold">Account</h3>
                            <p className="text-sm text-muted-foreground">
                                {hasCustomTokenAccountOverride ? 'Custom token account' : 'Derived ATA'}
                            </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={refreshStatus} disabled={busy}>
                            <RotateCw className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                    </div>
                    <div className="grid gap-2 text-sm md:grid-cols-2">
                        <div className="rounded-md bg-muted p-3">
                            <div className="text-muted-foreground">Wallet</div>
                            <div className="font-mono text-xs break-all">{owner ?? '-'}</div>
                        </div>
                        <div className="rounded-md bg-muted p-3">
                            <div className="text-muted-foreground">Token account</div>
                            <div className="font-mono text-xs break-all">{displayedTokenAccount ?? '-'}</div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confidential-token-account-override">Token account override</Label>
                        <Input
                            id="confidential-token-account-override"
                            value={tokenAccountOverride}
                            onChange={event => setTokenAccountOverride(event.target.value)}
                            placeholder="Optional custom token account"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-md bg-muted p-3">
                            <div className="text-muted-foreground">Configured</div>
                            <div className="font-medium">{status?.configured ? 'Yes' : 'No'}</div>
                        </div>
                        <div className="rounded-md bg-muted p-3">
                            <div className="text-muted-foreground">Approved</div>
                            <div className="font-medium">
                                {status?.approved === null ? 'Unknown' : status?.approved ? 'Yes' : 'No'}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            onClick={runConfigure}
                            disabled={busy || !signer || !isActionAvailable('configureAccount')}
                        >
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Configure
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={runApprove}
                            disabled={busy || !transactionSigner || !isActionAvailable('approveAccount')}
                        >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Approve
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={runEmptyAccount}
                            disabled={busy || !signer || !isActionAvailable('emptyAccount')}
                        >
                            Empty
                        </Button>
                    </div>
                </section>

                <section className="rounded-lg border bg-card p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-semibold">Balances</h3>
                            <p className="text-sm text-muted-foreground">Public and encrypted amounts</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={refreshBalances} disabled={busy || !signer}>
                            <Eye className="h-4 w-4 mr-2" />
                            Read
                        </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-md bg-muted p-3">
                            <div className="text-muted-foreground">Public</div>
                            <div className="font-medium">{formatTokenAmount(publicBalance, token.decimals)}</div>
                        </div>
                        <div className="rounded-md bg-muted p-3">
                            <div className="text-muted-foreground">Pending</div>
                            <div className="font-medium">
                                {formatTokenAmount(balances?.pendingBalance, token.decimals)}
                            </div>
                        </div>
                        <div className="rounded-md bg-muted p-3">
                            <div className="text-muted-foreground">Available</div>
                            <div className="font-medium">
                                {formatTokenAmount(balances?.availableBalance, token.decimals)}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={runApplyPending}
                            disabled={busy || !signer || !isActionAvailable('applyPendingBalance')}
                        >
                            Apply Pending
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runSetCredits('confidential', true)}
                            disabled={busy || !transactionSigner || !isActionAvailable('setConfidentialCredits')}
                        >
                            Confidential On
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runSetCredits('non-confidential', true)}
                            disabled={busy || !transactionSigner || !isActionAvailable('setNonConfidentialCredits')}
                        >
                            Public On
                        </Button>
                    </div>
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Message signatures derive confidential keys and are cached in this tab. On-chain actions
                            still require transaction signatures.
                        </span>
                    </p>
                </section>
            </div>

            <section className="rounded-lg border bg-card p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-base font-semibold">Move Funds</h3>
                        <p className="text-sm text-muted-foreground">Deposit, transfer, and withdraw</p>
                    </div>
                    {hasConfidentialFees && <Badge variant="secondary">Fees enabled</Badge>}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="confidential-amount">Amount</Label>
                        <Input
                            id="confidential-amount"
                            value={amount}
                            onChange={event => setAmount(event.target.value)}
                            placeholder="0.00"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confidential-recipient">Recipient</Label>
                        <Input
                            id="confidential-recipient"
                            value={recipient}
                            onChange={event => setRecipient(event.target.value)}
                            placeholder="Wallet or token account"
                        />
                    </div>
                </div>
                {hasConfidentialFees && (
                    <label className="flex items-center gap-2 text-sm">
                        <Switch
                            checked={useFeePlan && transferWithFeeSupported}
                            disabled={!transferWithFeeSupported}
                            onCheckedChange={checked => {
                                if (checked && !feeCapability.transferWithFee.supported) {
                                    setError(feeCapability.transferWithFee.reason);
                                    setUseFeePlan(false);
                                    return;
                                }
                                setUseFeePlan(checked);
                            }}
                        />
                        Confidential transfer with fee
                    </label>
                )}
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        onClick={runDeposit}
                        disabled={busy || !transactionSigner || !amount || !isActionAvailable('deposit')}
                    >
                        <WalletCards className="h-4 w-4 mr-2" />
                        Deposit
                    </Button>
                    <Button
                        size="sm"
                        onClick={runTransfer}
                        disabled={
                            busy ||
                            !signer ||
                            !amount ||
                            !recipient ||
                            !isActionAvailable('transfer') ||
                            (useFeePlan && !transferWithFeeSupported)
                        }
                    >
                        <Send className="h-4 w-4 mr-2" />
                        Transfer
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={runWithdraw}
                        disabled={busy || !signer || !amount || !isActionAvailable('withdraw')}
                    >
                        Withdraw
                    </Button>
                </div>
            </section>

            <section className="rounded-lg border bg-card p-4 space-y-4">
                <div>
                    <h3 className="text-base font-semibold">Mint Settings</h3>
                    <p className="text-sm text-muted-foreground">Approval and auditor settings</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
                    Auto approve new accounts
                </label>
                <div className="space-y-2">
                    <Label htmlFor="confidential-auditor">Auditor ElGamal pubkey</Label>
                    <Input
                        id="confidential-auditor"
                        value={auditorElgamalPubkey}
                        onChange={event => setAuditorElgamalPubkey(event.target.value)}
                        placeholder="Optional auditor key"
                    />
                </div>
                <Button size="sm" onClick={runUpdateMint} disabled={busy || !transactionSigner}>
                    <Settings2 className="h-4 w-4 mr-2" />
                    Update Mint
                </Button>
            </section>

            {hasConfidentialFees && (
                <section className="rounded-lg border bg-card p-4 space-y-4">
                    <div>
                        <h3 className="text-base font-semibold">Fees</h3>
                        <p className="text-sm text-muted-foreground">Harvest and withdraw withheld fees</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confidential-fee-sources">Source accounts</Label>
                        <Input
                            id="confidential-fee-sources"
                            value={sources}
                            onChange={event => setSources(event.target.value)}
                            placeholder="Comma-separated token accounts"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={runHarvestFees}
                            disabled={busy || !transactionSigner || !sources.trim()}
                        >
                            Harvest Fees
                        </Button>
                        <Button
                            size="sm"
                            onClick={runWithdrawFees}
                            disabled={busy || !signer || !hasTokenAccountTarget || !feeWithdrawSupported}
                        >
                            Withdraw Fees
                        </Button>
                    </div>
                </section>
            )}

            {(busy || progress.length > 0 || error || cleanupError) && (
                <section className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        {busy && <Spinner size={16} />}
                        <h3 className="text-base font-semibold">Progress</h3>
                    </div>
                    {progress.map(item => (
                        <div
                            key={`${item.index}-${item.label}`}
                            className="flex items-center justify-between gap-3 text-sm"
                        >
                            <span>
                                {item.index}/{item.total} {item.label}
                            </span>
                            <span className={item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                                {progressText(item)}
                            </span>
                        </div>
                    ))}
                    {cleanupError && <p className="text-sm text-amber-600">Cleanup failed: {cleanupError}</p>}
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </section>
            )}
        </div>
    );
}
