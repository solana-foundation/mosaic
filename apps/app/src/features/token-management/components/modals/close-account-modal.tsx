import { useState, useEffect } from 'react';
import { closeTokenAccount, type CloseAccountOptions } from '@/features/token-management/lib/close-account';
import { TransactionModifyingSigner } from '@solana/signers';
import { XCircle } from 'lucide-react';
import { useConnector } from '@solana/connector/react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import { ExtensionModal } from '@/components/shared/modals/extension-modal';
import { ModalWarning } from '@/components/shared/modals/modal-warning';
import { ModalError } from '@/components/shared/modals/modal-error';
import { ModalFooter } from '@/components/shared/modals/modal-footer';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { SolanaAddressInput } from '@/components/shared/form/solana-address-input';
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

interface CloseAccountModalContentProps {
    mintAddress: string;
    tokenSymbol?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function CloseAccountModalContent({
    mintAddress,
    tokenSymbol,
    transactionSendingSigner,
}: CloseAccountModalContentProps) {
    const { walletAddress } = useWalletConnection();
    const { cluster } = useConnector();
    const { validateSolanaAddress } = useInputValidation();
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

    const [useCustomDestination, setUseCustomDestination] = useState(false);
    const [destination, setDestination] = useState('');

    const handleCloseAccount = async () => {
        if (!walletAddress) {
            setError(MODAL_ERRORS.WALLET_NOT_CONNECTED);
            return;
        }

        if (useCustomDestination && !validateSolanaAddress(destination)) {
            setError(MODAL_ERRORS.INVALID_DESTINATION_ADDRESS);
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

            const options: CloseAccountOptions = {
                mintAddress,
                destination: useCustomDestination ? destination : undefined,
                rpcUrl,
            };

            const result = await closeTokenAccount(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
            } else {
                setError(result.error || 'Close account failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : MODAL_ERRORS.UNEXPECTED_ERROR);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setUseCustomDestination(false);
        setDestination('');
        reset();
    };

    useEffect(() => {
        return () => {
            setUseCustomDestination(false);
            setDestination('');
            reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <ExtensionModal
            title={MODAL_TITLES.CLOSE_TOKEN_ACCOUNT}
            successTitle={MODAL_TITLES.ACCOUNT_CLOSED}
            description={MODAL_DESCRIPTIONS.CLOSE_ACCOUNT(tokenSymbol)}
            icon={XCircle}
            iconClassName="text-red-500"
            isSuccess={success}
            onClose={resetForm}
            successView={
                <TransactionSuccessView
                    title="Account closed successfully!"
                    message={MODAL_SUCCESS_MESSAGES.ACCOUNT_CLOSED}
                    transactionSignature={transactionSignature}
                    cluster={(cluster as { name?: string })?.name}
                />
            }
        >
            <ModalWarning variant="amber" title={MODAL_WARNINGS.REQUIREMENTS_TITLE}>
                <ul className="list-disc pl-5 space-y-1">
                    <li>
                        Your token account must have a <strong>zero balance</strong>
                    </li>
                    <li>{MODAL_WARNINGS.CLOSE_ACCOUNT_RENT}</li>
                    <li>{MODAL_WARNINGS.CLOSE_ACCOUNT_IRREVERSIBLE}</li>
                </ul>
            </ModalWarning>

            <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
                <div className="space-y-0.5">
                    <Label htmlFor="custom-dest">{MODAL_LABELS.CUSTOM_DESTINATION}</Label>
                    <p className="text-xs text-muted-foreground">{MODAL_HELP_TEXT.CUSTOM_RENT_HELP}</p>
                </div>
                <Switch
                    id="custom-dest"
                    checked={useCustomDestination}
                    onCheckedChange={setUseCustomDestination}
                    disabled={isLoading}
                />
            </div>

            {useCustomDestination && (
                <SolanaAddressInput
                    label={MODAL_LABELS.DESTINATION_ADDRESS}
                    value={destination}
                    onChange={setDestination}
                    placeholder="Enter destination address for rent..."
                    helpText={MODAL_HELP_TEXT.RENT_DESTINATION_HELP}
                    required
                    disabled={isLoading}
                />
            )}

            {!useCustomDestination && walletAddress && (
                <div>
                    <label className="block text-sm font-medium mb-2">{MODAL_LABELS.RENT_DESTINATION}</label>
                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                        {walletAddress}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{MODAL_HELP_TEXT.RENT_TO_WALLET}</p>
                </div>
            )}

            <ModalError error={error} />

            <ModalFooter
                isLoading={isLoading}
                onAction={handleCloseAccount}
                actionLabel={MODAL_BUTTONS.CLOSE_ACCOUNT}
                loadingLabel={MODAL_BUTTONS.CLOSING}
                actionIcon={XCircle}
                actionDisabled={useCustomDestination && !validateSolanaAddress(destination)}
                actionClassName="bg-red-500 hover:bg-red-600 text-white"
            />
        </ExtensionModal>
    );
}
