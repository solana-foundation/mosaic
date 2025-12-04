import { useState, useEffect } from 'react';
import { forceTransferTokens, type ForceTransferOptions } from '@/features/token-management/lib/force-transfer';
import { TransactionModifyingSigner } from '@solana/signers';
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

interface ForceTransferModalContentProps {
    mintAddress: string;
    permanentDelegate?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function ForceTransferModalContent({
    mintAddress,
    permanentDelegate,
    transactionSendingSigner,
}: ForceTransferModalContentProps) {
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
    const [toAddress, setToAddress] = useState('');
    const [amount, setAmount] = useState('');

    const handleForceTransfer = async () => {
        if (!walletAddress) {
            setError(MODAL_ERRORS.WALLET_NOT_CONNECTED);
            return;
        }

        if (!validateSolanaAddress(fromAddress)) {
            setError(MODAL_ERRORS.INVALID_SOURCE_ADDRESS);
            return;
        }

        if (!validateSolanaAddress(toAddress)) {
            setError(MODAL_ERRORS.INVALID_DESTINATION_ADDRESS);
            return;
        }

        if (fromAddress === toAddress) {
            setError(MODAL_ERRORS.SAME_ADDRESS);
            return;
        }

        if (!validateAmount(amount)) {
            setError(MODAL_ERRORS.INVALID_AMOUNT);
            return;
        }

        if (parseFloat(amount) <= 0) {
            setError(MODAL_ERRORS.AMOUNT_GREATER_THAN_ZERO);
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const forceTransferOptions: ForceTransferOptions = {
                mintAddress,
                fromAddress,
                toAddress,
                amount,
                permanentDelegate: permanentDelegate || walletAddress,
                feePayer: walletAddress,
                rpcUrl: (cluster as { url?: string })?.url,
            };

            const result = await forceTransferTokens(forceTransferOptions, transactionSendingSigner);

            if (result.success) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature || '');
            } else {
                setError(result.error || 'Force transfer failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : MODAL_ERRORS.AN_ERROR_OCCURRED);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFromAddress('');
        setToAddress('');
        setAmount('');
        reset();
    };

    useEffect(() => {
        return () => {
            setFromAddress('');
            setToAddress('');
            setAmount('');
            reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Compute disabled label to help user understand what's needed
    const getDisabledLabel = (): string | undefined => {
        if (!walletAddress) return MODAL_BUTTONS.CONNECT_WALLET;
        if (!fromAddress.trim()) return MODAL_BUTTONS.ENTER_SOURCE;
        if (fromAddress.trim() && !validateSolanaAddress(fromAddress)) return MODAL_BUTTONS.INVALID_ADDRESS;
        if (!toAddress.trim()) return MODAL_BUTTONS.ENTER_DESTINATION;
        if (toAddress.trim() && !validateSolanaAddress(toAddress)) return MODAL_BUTTONS.INVALID_ADDRESS;
        if (!amount.trim()) return MODAL_BUTTONS.ENTER_AMOUNT;
        if (amount.trim() && !validateAmount(amount)) return MODAL_BUTTONS.INVALID_AMOUNT;
        return undefined;
    };

    // Show unauthorized view if wallet doesn't have permanent delegate authority
    if (!hasPermanentDelegate && permanentDelegate) {
        return (
            <ExtensionModal
                title={MODAL_TITLES.FORCE_TRANSFER_TOKENS}
                description={MODAL_DESCRIPTIONS.FORCE_TRANSFER}
                isSuccess={false}
            >
                <UnauthorizedView
                    type="forceTransfer"
                    authorityAddress={permanentDelegate}
                    walletAddress={walletAddress}
                />
            </ExtensionModal>
        );
    }

    return (
        <ExtensionModal
            title={MODAL_TITLES.FORCE_TRANSFER_TOKENS}
            successTitle={MODAL_TITLES.FORCE_TRANSFER_SUCCESSFUL}
            description={MODAL_DESCRIPTIONS.FORCE_TRANSFER}
            isSuccess={success}
            onClose={resetForm}
            successView={
                <TransactionSuccessView
                    title={MODAL_SUCCESS_MESSAGES.TOKENS_TRANSFERRED}
                    message={`${amount} tokens transferred from ${fromAddress.slice(0, 8)}...${fromAddress.slice(-6)} to ${toAddress.slice(0, 8)}...${toAddress.slice(-6)}`}
                    transactionSignature={transactionSignature}
                    cluster={(cluster as { name?: string })?.name}
                />
            }
        >
            <SolanaAddressInput
                label={MODAL_LABELS.SOURCE_ADDRESS}
                value={fromAddress}
                onChange={setFromAddress}
                placeholder="Enter source wallet address..."
                helpText={MODAL_HELP_TEXT.SOURCE_HELP}
                required
                disabled={isLoading}
            />

            <SolanaAddressInput
                label={MODAL_LABELS.DESTINATION_ADDRESS}
                value={toAddress}
                onChange={setToAddress}
                placeholder="Enter destination wallet address..."
                helpText={MODAL_HELP_TEXT.DESTINATION_HELP}
                required
                disabled={isLoading}
            />

            <AmountInput
                label={MODAL_LABELS.AMOUNT}
                value={amount}
                onChange={setAmount}
                placeholder="Enter amount to transfer..."
                helpText={MODAL_HELP_TEXT.MINT_AMOUNT}
                required
                disabled={isLoading}
            />

            <ModalWarning variant="amber" title={MODAL_WARNINGS.ADMINISTRATOR_ACTION_TITLE}>
                {MODAL_WARNINGS.FORCE_TRANSFER_WARNING}
            </ModalWarning>

            {permanentDelegate && (
                <div>
                    <label className="block text-sm font-medium mb-2">{MODAL_LABELS.PERMANENT_DELEGATE_AUTHORITY}</label>
                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                        {permanentDelegate}
                    </div>
                </div>
            )}

            <ModalError error={error} />

            <ModalFooter
                isLoading={isLoading}
                onAction={handleForceTransfer}
                actionLabel={MODAL_BUTTONS.FORCE_TRANSFER}
                loadingLabel={MODAL_BUTTONS.PROCESSING}
                actionDisabled={
                    !walletAddress ||
                    !fromAddress.trim() ||
                    !toAddress.trim() ||
                    !amount.trim() ||
                    !validateSolanaAddress(fromAddress) ||
                    !validateSolanaAddress(toAddress) ||
                    !validateAmount(amount)
                }
                disabledLabel={getDisabledLabel()}
                actionClassName="bg-amber-500 hover:bg-amber-600 text-white"
            />
        </ExtensionModal>
    );
}
