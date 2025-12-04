import { useState, useEffect } from 'react';
import { forceBurnTokens, type ForceBurnOptions } from '@/features/token-management/lib/force-burn';
import { TransactionModifyingSigner } from '@solana/signers';
import { Flame } from 'lucide-react';
import { useConnector } from '@solana/connector/react';

import { ExtensionModal } from '@/components/shared/modals/extension-modal';
import { ModalWarning } from '@/components/shared/modals/modal-warning';
import { ModalError } from '@/components/shared/modals/modal-error';
import { ModalFooter } from '@/components/shared/modals/modal-footer';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { UnauthorizedView } from '@/components/shared/modals/unauthorized-view';
import { SolanaAddressInput } from '@/components/shared/form/solana-address-input';
import { AmountInput } from '@/components/shared/form/amount-input';
import { useTransactionModal } from '@/features/token-management/hooks/use-transaction-modal';
import { useAuthority } from '@/features/token-management/hooks/use-authority';
import { useInputValidation } from '@/hooks/use-input-validation';
import {
    MODAL_ERRORS,
    MODAL_BUTTONS,
    MODAL_WARNINGS,
    MODAL_LABELS,
    MODAL_HELP_TEXT,
    MODAL_TITLES,
    MODAL_DESCRIPTIONS,
    MODAL_SUCCESS_MESSAGES,
} from '@/features/token-management/constants/modal-text';

interface ForceBurnModalContentProps {
    mintAddress: string;
    permanentDelegate?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
    onSuccess?: () => void;
}

export function ForceBurnModalContent({
    mintAddress,
    permanentDelegate,
    transactionSendingSigner,
    onSuccess,
}: ForceBurnModalContentProps) {
    const { cluster } = useConnector();
    const { validateSolanaAddress, validateAmount } = useInputValidation();
    const { hasPermanentDelegate, walletAddress } = useAuthority({ permanentDelegate });
    const {
        isLoading,
        error,
        success,
        transactionSignature,
        setIsLoading,
        setError,
        setSuccess,
        setTransactionSignature,
        reset,
    } = useTransactionModal();

    const [fromAddress, setFromAddress] = useState('');
    const [amount, setAmount] = useState('');

    const handleForceBurn = async () => {
        if (!walletAddress) {
            setError(MODAL_ERRORS.WALLET_NOT_CONNECTED);
            return;
        }

        if (!validateSolanaAddress(fromAddress)) {
            setError(MODAL_ERRORS.INVALID_SOURCE_ADDRESS);
            return;
        }

        if (!validateAmount(amount)) {
            setError(MODAL_ERRORS.INVALID_AMOUNT);
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

            const options: ForceBurnOptions = {
                mintAddress,
                fromAddress,
                amount,
                permanentDelegate: permanentDelegate || walletAddress,
                rpcUrl,
            };

            const result = await forceBurnTokens(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
                onSuccess?.();
            } else {
                setError(result.error || 'Force burn failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : MODAL_ERRORS.UNEXPECTED_ERROR);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFromAddress('');
        setAmount('');
        reset();
    };

    useEffect(() => {
        return () => {
            setFromAddress('');
            setAmount('');
            reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Compute disabled label to help user understand what's needed
    const getDisabledLabel = (): string | undefined => {
        if (!walletAddress) return MODAL_BUTTONS.CONNECT_WALLET;
        if (!fromAddress.trim()) return MODAL_BUTTONS.ENTER_ADDRESS;
        if (fromAddress.trim() && !validateSolanaAddress(fromAddress)) return MODAL_BUTTONS.INVALID_ADDRESS;
        if (!amount.trim()) return MODAL_BUTTONS.ENTER_AMOUNT;
        if (amount.trim() && !validateAmount(amount)) return MODAL_BUTTONS.INVALID_AMOUNT;
        return undefined;
    };

    // Show unauthorized view if wallet doesn't have permanent delegate authority
    if (!hasPermanentDelegate && permanentDelegate) {
        return (
            <ExtensionModal
                title={MODAL_TITLES.FORCE_BURN_TOKENS}
                description={MODAL_DESCRIPTIONS.FORCE_BURN}
                isSuccess={false}
            >
                <UnauthorizedView
                    type="forceBurn"
                    authorityAddress={permanentDelegate}
                    walletAddress={walletAddress}
                />
            </ExtensionModal>
        );
    }

    return (
        <ExtensionModal
            title={MODAL_TITLES.FORCE_BURN_TOKENS}
            successTitle={MODAL_TITLES.FORCE_BURN_SUCCESSFUL}
            description={MODAL_DESCRIPTIONS.FORCE_BURN}
            isSuccess={success}
            onClose={resetForm}
            successView={
                <TransactionSuccessView
                    title={MODAL_SUCCESS_MESSAGES.TOKENS_BURNED}
                    message={`${amount} tokens have been permanently burned from ${fromAddress.slice(0, 8)}...${fromAddress.slice(-6)}`}
                    transactionSignature={transactionSignature}
                    cluster={(cluster as { name?: string })?.name}
                />
            }
        >
            <SolanaAddressInput
                label={MODAL_LABELS.BURN_FROM_ADDRESS}
                value={fromAddress}
                onChange={setFromAddress}
                placeholder="Enter wallet or token account address..."
                helpText={MODAL_HELP_TEXT.BURN_FROM_HELP}
                required
                disabled={isLoading}
            />

            <AmountInput
                label={MODAL_LABELS.AMOUNT_TO_BURN}
                value={amount}
                onChange={setAmount}
                placeholder="Enter amount to burn..."
                helpText={MODAL_HELP_TEXT.FORCE_BURN_AMOUNT}
                required
                disabled={isLoading}
            />

            <ModalWarning variant="red" title={MODAL_WARNINGS.IRREVERSIBLE_TITLE}>
                {MODAL_WARNINGS.FORCE_BURN_WARNING}
            </ModalWarning>

            {permanentDelegate && (
                <div>
                    <label className="block text-sm font-medium mb-2">{MODAL_LABELS.PERMANENT_DELEGATE_AUTHORITY}</label>
                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                        {permanentDelegate}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{MODAL_HELP_TEXT.PERMANENT_DELEGATE_HELP}</p>
                </div>
            )}

            <ModalError error={error} />

            <ModalFooter
                isLoading={isLoading}
                onAction={handleForceBurn}
                actionLabel={MODAL_BUTTONS.FORCE_BURN}
                loadingLabel={MODAL_BUTTONS.BURNING}
                actionIcon={Flame}
                actionDisabled={
                    !walletAddress ||
                    !fromAddress.trim() ||
                    !amount.trim() ||
                    !validateSolanaAddress(fromAddress) ||
                    !validateAmount(amount)
                }
                disabledLabel={getDisabledLabel()}
                actionClassName="bg-red-500 hover:bg-red-600 text-white"
            />
        </ExtensionModal>
    );
}
