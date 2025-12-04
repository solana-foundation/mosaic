import { useState, useEffect } from 'react';
import { burnTokens, type BurnOptions } from '@/features/token-management/lib/burn';
import { TransactionModifyingSigner } from '@solana/signers';
import { Flame } from 'lucide-react';
import { useConnector } from '@solana/connector/react';

import { ExtensionModal } from '@/components/shared/modals/extension-modal';
import { ModalWarning } from '@/components/shared/modals/modal-warning';
import { ModalError } from '@/components/shared/modals/modal-error';
import { ModalFooter } from '@/components/shared/modals/modal-footer';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { AmountInput } from '@/components/shared/form/amount-input';
import { useTransactionModal, useWalletConnection } from '@/features/token-management/hooks/use-transaction-modal';
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

interface BurnModalContentProps {
    mintAddress: string;
    tokenSymbol?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
    onSuccess?: () => void;
    onModalClose?: () => void;
}

export function BurnModalContent({
    mintAddress,
    tokenSymbol,
    transactionSendingSigner,
    onSuccess,
    onModalClose,
}: BurnModalContentProps) {
    const { walletAddress } = useWalletConnection();
    const { cluster } = useConnector();
    const { validateAmount } = useInputValidation();
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

    const [amount, setAmount] = useState('');

    const handleBurn = async () => {
        if (!walletAddress) {
            setError(MODAL_ERRORS.WALLET_NOT_CONNECTED);
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

            const options: BurnOptions = {
                mintAddress,
                amount,
                rpcUrl,
            };

            const result = await burnTokens(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
                onSuccess?.();
            } else {
                setError(result.error || 'Burn failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : MODAL_ERRORS.UNEXPECTED_ERROR);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setAmount('');
        reset();
    };

    useEffect(() => {
        return () => {
            setAmount('');
            reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleContinue = () => {
        resetForm();
    };

    // Compute disabled label to help user understand what's needed
    const getDisabledLabel = (): string | undefined => {
        if (!walletAddress) return MODAL_BUTTONS.CONNECT_WALLET;
        if (!amount.trim()) return MODAL_BUTTONS.ENTER_AMOUNT;
        if (amount.trim() && !validateAmount(amount)) return MODAL_BUTTONS.INVALID_AMOUNT;
        return undefined;
    };

    return (
        <ExtensionModal
            title={MODAL_TITLES.BURN_TOKENS}
            successTitle={MODAL_TITLES.BURN_SUCCESSFUL}
            description={MODAL_DESCRIPTIONS.BURN(tokenSymbol)}
            icon={Flame}
            iconClassName="text-orange-500"
            isSuccess={success}
            successView={
                <TransactionSuccessView
                    title={MODAL_SUCCESS_MESSAGES.TOKENS_BURNED}
                    message={`${amount} ${tokenSymbol || 'tokens'} have been permanently destroyed`}
                    transactionSignature={transactionSignature}
                    cluster={(cluster as { name?: string })?.name}
                    onClose={onModalClose ?? handleContinue}
                    onContinue={handleContinue}
                    continueLabel={MODAL_BUTTONS.BURN_MORE}
                />
            }
        >
            <AmountInput
                label={MODAL_LABELS.AMOUNT_TO_BURN}
                value={amount}
                onChange={setAmount}
                placeholder="Enter amount to burn..."
                helpText={MODAL_HELP_TEXT.BURN_AMOUNT(tokenSymbol)}
                required
                disabled={isLoading}
            />

            <ModalWarning variant="orange" title={MODAL_WARNINGS.IRREVERSIBLE_TITLE}>
                {MODAL_WARNINGS.BURN_WARNING}
            </ModalWarning>

            {walletAddress && (
                <div>
                    <label className="block text-sm font-medium mb-2">{MODAL_LABELS.BURN_FROM}</label>
                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                        {walletAddress}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{MODAL_HELP_TEXT.BURN_FROM_WALLET}</p>
                </div>
            )}

            <ModalError error={error} />

            <ModalFooter
                isLoading={isLoading}
                onAction={handleBurn}
                actionLabel={MODAL_BUTTONS.BURN_TOKENS}
                loadingLabel={MODAL_BUTTONS.BURNING}
                actionIcon={Flame}
                actionDisabled={!walletAddress || !amount.trim() || !validateAmount(amount)}
                disabledLabel={getDisabledLabel()}
                actionClassName="bg-orange-500 hover:bg-orange-600 text-white"
            />
        </ExtensionModal>
    );
}
