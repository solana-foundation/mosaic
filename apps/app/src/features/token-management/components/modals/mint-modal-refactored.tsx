import { useState, useEffect } from 'react';
import { mintTokens, type MintOptions } from '@/features/token-management/lib/mint';
import { TransactionModifyingSigner } from '@solana/signers';
import { Coins } from 'lucide-react';
import { useConnector } from '@solana/connector/react';

import { ExtensionModal } from '@/components/shared/modals/extension-modal';
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
    MODAL_LABELS,
    MODAL_HELP_TEXT,
    MODAL_TITLES,
    MODAL_DESCRIPTIONS,
    MODAL_SUCCESS_MESSAGES,
} from '@/features/token-management/constants/modal-text';

interface MintModalContentProps {
    mintAddress: string;
    mintAuthority?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
    onSuccess?: () => void;
    onModalClose?: () => void;
}

export function MintModalContent({
    mintAddress,
    mintAuthority,
    transactionSendingSigner,
    onSuccess,
    onModalClose,
}: MintModalContentProps) {
    const { cluster } = useConnector();
    const { validateSolanaAddress, validateAmount } = useInputValidation();
    const { hasMintAuthority, walletAddress } = useAuthority({ mintAuthority });
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

    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');

    const handleMint = async () => {
        if (!walletAddress) {
            setError(MODAL_ERRORS.WALLET_NOT_CONNECTED);
            return;
        }

        if (!validateSolanaAddress(recipient)) {
            setError(MODAL_ERRORS.INVALID_ADDRESS);
            return;
        }

        if (!validateAmount(amount)) {
            setError(MODAL_ERRORS.INVALID_AMOUNT);
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const mintOptions: MintOptions = {
                mintAddress,
                recipient,
                amount,
                mintAuthority: mintAuthority || walletAddress,
                feePayer: walletAddress,
            };

            const result = await mintTokens(mintOptions, transactionSendingSigner);

            if (result.success) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature || '');
                onSuccess?.();
            } else {
                setError(result.error || 'Minting failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : MODAL_ERRORS.AN_ERROR_OCCURRED);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setRecipient('');
        setAmount('');
        reset();
    };

    useEffect(() => {
        return () => {
            setRecipient('');
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
        if (!recipient.trim()) return MODAL_BUTTONS.ENTER_RECIPIENT;
        if (recipient.trim() && !validateSolanaAddress(recipient)) return MODAL_BUTTONS.INVALID_ADDRESS;
        if (!amount.trim()) return MODAL_BUTTONS.ENTER_AMOUNT;
        if (amount.trim() && !validateAmount(amount)) return MODAL_BUTTONS.INVALID_AMOUNT;
        return undefined;
    };

    // Show unauthorized view if wallet doesn't have mint authority
    if (!hasMintAuthority && mintAuthority) {
        return (
            <ExtensionModal
                title={MODAL_TITLES.MINT_TOKENS}
                description={MODAL_DESCRIPTIONS.MINT}
                isSuccess={false}
            >
                <UnauthorizedView
                    type="mint"
                    authorityAddress={mintAuthority}
                    walletAddress={walletAddress}
                />
            </ExtensionModal>
        );
    }

    return (
        <ExtensionModal
            title={MODAL_TITLES.MINT_TOKENS}
            successTitle={MODAL_TITLES.MINT_SUCCESSFUL}
            description={MODAL_DESCRIPTIONS.MINT}
            isSuccess={success}
            successView={
                <TransactionSuccessView
                    title={MODAL_SUCCESS_MESSAGES.TOKENS_MINTED}
                    message={`${amount} tokens minted to ${recipient}`}
                    transactionSignature={transactionSignature}
                    cluster={(cluster as { name?: string })?.name}
                    onClose={onModalClose ?? handleContinue}
                    onContinue={handleContinue}
                    continueLabel={MODAL_BUTTONS.MINT_MORE}
                />
            }
        >
            <SolanaAddressInput
                label={MODAL_LABELS.RECIPIENT_ADDRESS}
                value={recipient}
                onChange={setRecipient}
                placeholder="Enter recipient Solana address..."
                required
                disabled={isLoading}
            />

            <AmountInput
                label={MODAL_LABELS.AMOUNT}
                value={amount}
                onChange={setAmount}
                placeholder="Enter amount to mint..."
                helpText={MODAL_HELP_TEXT.MINT_AMOUNT}
                required
                disabled={isLoading}
            />

            {mintAuthority && (
                <div>
                    <label className="block text-sm font-medium mb-2">{MODAL_LABELS.MINT_AUTHORITY}</label>
                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                        {mintAuthority}
                    </div>
                </div>
            )}

            <ModalError error={error} />

            <ModalFooter
                isLoading={isLoading}
                onAction={handleMint}
                actionLabel={MODAL_BUTTONS.MINT_TOKENS}
                loadingLabel={MODAL_BUTTONS.MINTING}
                actionIcon={Coins}
                actionDisabled={
                    !walletAddress ||
                    !recipient.trim() ||
                    !amount.trim() ||
                    !validateSolanaAddress(recipient) ||
                    !validateAmount(amount)
                }
                disabledLabel={getDisabledLabel()}
            />
        </ExtensionModal>
    );
}
