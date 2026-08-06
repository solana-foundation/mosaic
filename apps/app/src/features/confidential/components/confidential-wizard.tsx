'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type Signature,
    type SolanaRpcApi,
    type TransactionSigner,
    createSolanaRpc,
} from '@solana/kit';
import { useConnector } from '@solana/connector/react';
import {
    Settings2,
    ArrowDownToLine,
    BadgeCheck,
    CheckCheck,
    Send,
    ArrowUpFromLine,
    Eraser,
    ShieldCheck,
} from 'lucide-react';
import { useConnectorSigner } from '@/features/wallet/hooks/use-connector-signer';
import { useTokenBalance } from '@/hooks/use-token-balance';
import { getClusterName } from '@/lib/solana/explorer';
import { useConfidentialKeys } from '../hooks/use-confidential-keys';
import { useConfidentialAccount } from '../hooks/use-confidential-account';
import { executeConfidentialPlan, type ConfidentialPlanProgress } from '../lib/execute-confidential-plan';
import {
    buildApplyPlan,
    buildApprovePlan,
    buildConfigurePlan,
    buildDepositPlan,
    buildEmptyPlan,
    buildEnableConfidentialCreditsPlan,
    buildTransferPlan,
    buildWithdrawPlan,
    fetchConfidentialMintConfig,
    fetchMintDecimals,
    resolveAta,
    type ConfidentialMintConfig,
} from '../lib/operations';
import { ConfidentialActionCard, type ConfidentialActionValues } from './confidential-action-card';
import { ConfidentialBalancePanel } from './confidential-balance-panel';

type RpcWithRent = Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;

interface ConfidentialWizardProps {
    mint: Address;
    symbol?: string;
}

/**
 * Guided, step-by-step demonstration of the confidential-transfer account
 * lifecycle: configure → approve → deposit → apply → transfer → withdraw →
 * empty, with a live balance panel. Each step builds a confidential
 * `InstructionPlan` and runs it through {@link executeConfidentialPlan}
 * (multi-transaction proof flows show per-tx progress), then refreshes the
 * balances.
 */
export function ConfidentialWizard({ mint, symbol }: ConfidentialWizardProps) {
    const { selectedAccount, cluster } = useConnector();
    const signer = useConnectorSigner();
    const { getKeys } = useConfidentialKeys();

    const owner = selectedAccount ? (String(selectedAccount) as Address) : undefined;
    const clusterName = getClusterName(cluster);

    const rpc = useMemo<RpcWithRent | null>(() => {
        if (!cluster?.url) return null;
        return createSolanaRpc(cluster.url) as RpcWithRent;
    }, [cluster?.url]);

    // Resolve the owner's associated token account (the confidential account).
    const [tokenAccount, setTokenAccount] = useState<Address | undefined>();
    useEffect(() => {
        let active = true;
        if (!owner) {
            setTokenAccount(undefined);
            return;
        }
        resolveAta(owner, mint).then(ata => {
            if (active) setTokenAccount(ata);
        });
        return () => {
            active = false;
        };
    }, [owner, mint]);

    // Mint decimals, for formatting decrypted confidential amounts.
    const [decimals, setDecimals] = useState<number>(0);
    useEffect(() => {
        if (!rpc) return;
        let active = true;
        fetchMintDecimals(rpc, mint)
            .then(d => {
                if (active) setDecimals(d);
            })
            .catch(() => {
                /* keep default */
            });
        return () => {
            active = false;
        };
    }, [rpc, mint]);

    // The mint's confidential config, to decide whether (and by whom) accounts
    // must be approved. Undefined while loading; null when the mint has no
    // ConfidentialTransferMint extension.
    const [mintConfig, setMintConfig] = useState<ConfidentialMintConfig | null | undefined>();
    useEffect(() => {
        if (!rpc) return;
        let active = true;
        fetchConfidentialMintConfig(rpc, mint)
            .then(c => {
                if (active) setMintConfig(c);
            })
            .catch(() => {
                /* leave undefined; the approve step stays enabled and fails on-chain if unusable */
            });
        return () => {
            active = false;
        };
    }, [rpc, mint]);

    const confAccount = useConfidentialAccount({ mint, tokenAccount, rpc });
    const tokenBalance = useTokenBalance(mint);

    const { isConfigured, refresh } = confAccount;
    const refetchPlaintext = tokenBalance.refetch;

    /** Builds a plan, executes it, then refreshes both balance views. */
    const runPlan = useCallback(
        async (build: () => Promise<InstructionPlan>, onProgress: ConfidentialPlanProgress): Promise<Signature[]> => {
            if (!rpc || !signer) throw new Error('Wallet not connected.');
            const plan = await build();
            const signatures = await executeConfidentialPlan({
                instructionPlan: plan,
                feePayer: signer as unknown as TransactionSigner,
                rpc,
                onProgress,
            });
            refresh();
            refetchPlaintext();
            return signatures;
        },
        [rpc, signer, refresh, refetchPlaintext],
    );

    const authority = signer as unknown as TransactionSigner;

    const configurePrereq = !tokenAccount
        ? 'Resolving your token account…'
        : isConfigured
          ? 'This account is already configured for confidential transfers.'
          : undefined;
    const needsConfigured = !tokenAccount
        ? 'Resolving your token account…'
        : !isConfigured
          ? 'Configure the account first (step 1).'
          : undefined;

    // Gated on mint-level facts only — the approval target may be another
    // owner's account, so the connected wallet's own configure/approve state
    // says nothing about whether this step should run.
    const approvePrereq = !tokenAccount
        ? 'Resolving your token account…'
        : mintConfig === null
          ? 'This mint does not support confidential transfers.'
          : mintConfig?.autoApproveNewAccounts
            ? 'This mint auto-approves new accounts — approval is not required.'
            : mintConfig && mintConfig.authority !== owner
              ? `Only the mint's confidential authority (${mintConfig.authority ?? 'none'}) can approve accounts.`
              : undefined;

    const handleConfigure = (_v: ConfidentialActionValues, onProgress: ConfidentialPlanProgress) =>
        runPlan(async () => {
            const keys = await getKeys(mint);
            return buildConfigurePlan({ rpc: rpc!, payer: authority, owner: authority, mint, keys });
        }, onProgress);

    const handleApprove = (v: ConfidentialActionValues, onProgress: ConfidentialPlanProgress) =>
        runPlan(async () => {
            // Blank address means "approve my own account".
            const target = v.address ? await resolveAta(v.address as Address, mint) : tokenAccount!;
            return buildApprovePlan({ tokenAccount: target, mint, authority });
        }, onProgress);

    const handleEnableCredits = (_v: ConfidentialActionValues, onProgress: ConfidentialPlanProgress) =>
        runPlan(() => buildEnableConfidentialCreditsPlan({ tokenAccount: tokenAccount!, authority }), onProgress);

    const handleDeposit = (v: ConfidentialActionValues, onProgress: ConfidentialPlanProgress) =>
        runPlan(
            () => buildDepositPlan({ rpc: rpc!, mint, tokenAccount: tokenAccount!, authority, amount: v.amount! }),
            onProgress,
        );

    const handleApply = (_v: ConfidentialActionValues, onProgress: ConfidentialPlanProgress) =>
        runPlan(async () => {
            const keys = await getKeys(mint);
            return buildApplyPlan({ rpc: rpc!, tokenAccount: tokenAccount!, authority, keys });
        }, onProgress);

    const handleTransfer = (v: ConfidentialActionValues, onProgress: ConfidentialPlanProgress) =>
        runPlan(async () => {
            const keys = await getKeys(mint);
            const destinationToken = await resolveAta(v.address! as Address, mint);
            return buildTransferPlan({
                rpc: rpc!,
                payer: authority,
                mint,
                sourceToken: tokenAccount!,
                destinationToken,
                authority,
                amount: v.amount!,
                keys,
            });
        }, onProgress);

    const handleWithdraw = (v: ConfidentialActionValues, onProgress: ConfidentialPlanProgress) =>
        runPlan(async () => {
            const keys = await getKeys(mint);
            return buildWithdrawPlan({
                rpc: rpc!,
                payer: authority,
                mint,
                tokenAccount: tokenAccount!,
                authority,
                amount: v.amount!,
                keys,
            });
        }, onProgress);

    const handleEmpty = (_v: ConfidentialActionValues, onProgress: ConfidentialPlanProgress) =>
        runPlan(async () => {
            const keys = await getKeys(mint);
            return buildEmptyPlan({ rpc: rpc!, payer: authority, tokenAccount: tokenAccount!, authority, keys });
        }, onProgress);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            {/* Steps */}
            <div className="space-y-4">
                <ConfidentialActionCard
                    stepNumber={1}
                    title="Configure account"
                    description="Create and configure your associated token account for confidential transfers."
                    icon={Settings2}
                    actionLabel="Configure account"
                    disabledReason={configurePrereq}
                    clusterName={clusterName}
                    onRun={handleConfigure}
                />
                <ConfidentialActionCard
                    stepNumber={2}
                    title="Approve account"
                    description="Whitelist mints require the confidential authority to approve an account before it can be used. Leave the address blank to approve your own."
                    icon={BadgeCheck}
                    actionLabel="Approve account"
                    fields={{ address: true }}
                    addressLabel="Owner wallet address (defaults to your own)"
                    addressPlaceholder="Enter owner Solana address..."
                    addressOptional
                    disabledReason={approvePrereq}
                    clusterName={clusterName}
                    onRun={handleApprove}
                />
                <ConfidentialActionCard
                    stepNumber={3}
                    title="Enable confidential credits"
                    description="Allow this account to receive incoming confidential transfers."
                    icon={ShieldCheck}
                    actionLabel="Enable confidential credits"
                    disabledReason={needsConfigured}
                    clusterName={clusterName}
                    onRun={handleEnableCredits}
                />
                <ConfidentialActionCard
                    stepNumber={4}
                    title="Deposit"
                    description="Move tokens from your public balance into the pending confidential balance."
                    icon={ArrowDownToLine}
                    actionLabel="Deposit to pending"
                    fields={{ amount: true }}
                    amountLabel="Amount to deposit"
                    amountSymbol={symbol}
                    disabledReason={needsConfigured}
                    clusterName={clusterName}
                    onRun={handleDeposit}
                />
                <ConfidentialActionCard
                    stepNumber={5}
                    title="Apply pending balance"
                    description="Apply the pending balance so it becomes spendable available balance."
                    icon={CheckCheck}
                    actionLabel="Apply pending → available"
                    disabledReason={needsConfigured}
                    clusterName={clusterName}
                    onRun={handleApply}
                />
                <ConfidentialActionCard
                    stepNumber={6}
                    title="Confidential transfer"
                    description="Send an encrypted amount to another wallet's confidential account."
                    icon={Send}
                    actionLabel="Send confidentially"
                    fields={{ address: true, amount: true }}
                    addressLabel="Recipient wallet address"
                    amountLabel="Amount to send"
                    amountSymbol={symbol}
                    disabledReason={needsConfigured}
                    clusterName={clusterName}
                    onRun={handleTransfer}
                />
                <ConfidentialActionCard
                    stepNumber={7}
                    title="Withdraw"
                    description="Move available confidential balance back to your public balance."
                    icon={ArrowUpFromLine}
                    actionLabel="Withdraw available → public"
                    fields={{ amount: true }}
                    amountLabel="Amount to withdraw"
                    amountSymbol={symbol}
                    disabledReason={needsConfigured}
                    clusterName={clusterName}
                    onRun={handleWithdraw}
                />
                <ConfidentialActionCard
                    stepNumber={8}
                    title="Empty account"
                    description="Prove the available balance is zero so the account can be closed. Withdraw everything first."
                    icon={Eraser}
                    actionLabel="Empty confidential balance"
                    disabledReason={needsConfigured}
                    clusterName={clusterName}
                    onRun={handleEmpty}
                />
            </div>

            {/* Sticky balance panel */}
            <div className="lg:sticky lg:top-6 lg:self-start">
                <ConfidentialBalancePanel
                    state={confAccount.state}
                    isConfigured={confAccount.isConfigured}
                    isRevealed={confAccount.isRevealed}
                    isLoading={confAccount.isLoading}
                    error={confAccount.error}
                    canReveal={confAccount.canReveal}
                    onReveal={confAccount.reveal}
                    onRefresh={confAccount.refresh}
                    decimals={decimals}
                    symbol={symbol}
                    plaintextBalance={tokenBalance.balance?.formattedBalance ?? null}
                    plaintextLoading={tokenBalance.isLoading}
                />
            </div>
        </div>
    );
}
