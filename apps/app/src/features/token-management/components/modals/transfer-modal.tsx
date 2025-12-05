import { useState, useEffect } from 'react';
import { transferTokens, type TransferTokensOptions } from '@/features/token-management/lib/transfer';
import type { TransactionModifyingSigner } from '@solana/kit';
import { Send } from 'lucide-react';
import { useConnector } from '@solana/connector/react';
import { Input } from '@/components/ui/input';

import { ExtensionModal } from '@/components/shared/modals/extension-modal';
import { ModalError } from '@/components/shared/modals/modal-error';
import { ModalFooter } from '@/components/shared/modals/modal-footer';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { SolanaAddressInput } from '@/components/shared/form/solana-address-input';
import { AmountInput } from '@/components/shared/form/amount-input';
import { useTransactionModal, useWalletConnection } from '@/features/token-management/hooks/use-transaction-modal';
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
import { humanizeError } from '@/lib/errors';

interface TransferModalContentProps {
    mintAddress: string;
    tokenSymbol?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function TransferModalContent({
    mintAddress,
    tokenSymbol,
    transactionSendingSigner,
}: TransferModalContentProps) {
    const { walletAddress } = useWalletConnection();
    const { cluster } = useConnector();
    const { validateSolanaAddress, validateAmount } = useInputValidation();
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
    const [memo, setMemo] = useState('');

    const handleTransfer = async () => {
        if (!walletAddress) {
            setError(MODAL_ERRORS.WALLET_NOT_CONNECTED);
            return;
        }

        if (!validateSolanaAddress(recipient)) {
            setError(MODAL_ERRORS.INVALID_RECIPIENT_ADDRESS);
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

            const options: TransferTokensOptions = {
                mintAddress,
                recipient,
                amount,
                memo: memo.trim() || undefined,
                rpcUrl,
            };

            const result = await transferTokens(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
            } else {
                setError(result.error || 'Transfer failed');
            }
        } catch (err) {
            setError(humanizeError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setRecipient('');
        setAmount('');
        setMemo('');
        reset();
    };

    useEffect(() => {
        return () => {
            setRecipient('');
            setAmount('');
            setMemo('');
            reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Compute disabled label to help user understand what's needed
    const getDisabledLabel = (): string | undefined => {
        if (!walletAddress) return MODAL_BUTTONS.CONNECT_WALLET;
        if (!recipient.trim()) return MODAL_BUTTONS.ENTER_RECIPIENT;
        if (recipient.trim() && !validateSolanaAddress(recipient)) return MODAL_BUTTONS.INVALID_ADDRESS;
        if (!amount.trim()) return MODAL_BUTTONS.ENTER_AMOUNT;
        if (amount.trim() && !validateAmount(amount)) return MODAL_BUTTONS.INVALID_AMOUNT;
        return undefined;
    };

    return (
        <ExtensionModal
            title={MODAL_TITLES.TRANSFER_TOKENS}
            successTitle={MODAL_TITLES.TRANSFER_SUCCESSFUL}
            description={MODAL_DESCRIPTIONS.TRANSFER(tokenSymbol)}
            icon={Send}
            iconClassName="text-primary"
            isSuccess={success}
            onClose={resetForm}
            successView={
                <TransactionSuccessView
                    title={MODAL_SUCCESS_MESSAGES.TRANSFER_SUCCESSFUL}
                    message={`${amount} ${tokenSymbol || 'tokens'} sent to ${recipient.slice(0, 8)}...${recipient.slice(-6)}`}
                    transactionSignature={transactionSignature}
                    cluster={(cluster as { name?: string })?.name}
                />
            }
        >
            <SolanaAddressInput
                label={MODAL_LABELS.RECIPIENT_ADDRESS}
                value={recipient}
                onChange={setRecipient}
                placeholder="Enter recipient Solana address..."
                helpText={MODAL_HELP_TEXT.RECIPIENT_HELP}
                required
                disabled={isLoading}
            />

            <AmountInput
                label={MODAL_LABELS.AMOUNT}
                value={amount}
                onChange={setAmount}
                placeholder="Enter amount to send..."
                helpText={MODAL_HELP_TEXT.TRANSFER_AMOUNT(tokenSymbol)}
                required
                disabled={isLoading}
            />

            <div>
                <label className="block text-sm font-medium mb-2">
                    {MODAL_LABELS.MEMO} <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                    placeholder="Add a memo to the transaction..."
                    className="rounded-xl"
                    disabled={isLoading}
                    maxLength={280}
                />
                <p className="text-xs text-muted-foreground mt-1.5">{MODAL_HELP_TEXT.MEMO_HELP}</p>
            </div>

            {walletAddress && (
                <div>
                    <label className="block text-sm font-medium mb-2">{MODAL_LABELS.FROM}</label>
                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                        {walletAddress}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{MODAL_HELP_TEXT.SEND_FROM_WALLET}</p>
                </div>
            )}

            <ModalError error={error} />

            <ModalFooter
                isLoading={isLoading}
                onAction={handleTransfer}
                actionLabel={MODAL_BUTTONS.SEND_TOKENS}
                loadingLabel={MODAL_BUTTONS.SENDING}
                actionIcon={Send}
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
