import { useState, useEffect } from 'react';
import { freezeTokenAccount } from '@/features/token-management/lib/freeze';
import { thawTokenAccount } from '@/features/token-management/lib/thaw';
import { TransactionModifyingSigner } from '@solana/signers';
import { Snowflake, Sun, LucideIcon } from 'lucide-react';
import { useConnector } from '@solana/connector/react';

import { ExtensionModal } from '@/components/shared/modals/extension-modal';
import { ModalWarning } from '@/components/shared/modals/modal-warning';
import { ModalError } from '@/components/shared/modals/modal-error';
import { ModalFooter } from '@/components/shared/modals/modal-footer';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { UnauthorizedView } from '@/components/shared/modals/unauthorized-view';
import { SolanaAddressInput } from '@/components/shared/form/solana-address-input';
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
import { humanizeError } from '@/lib/errors';

interface ModeConfig {
    icon: LucideIcon;
    iconClassName: string;
    title: string;
    successTitle: string;
    description: string;
    warningTitle: string;
    warningMessage: string;
    warningVariant: 'blue' | 'amber';
    actionLabel: string;
    loadingLabel: string;
    successMessage: (address: string) => string;
    continueLabel: string;
    actionClassName: string;
    unauthorizedType: 'freeze' | 'thaw';
    action: (
        options: { walletAddress: string; mintAddress: string; rpcUrl?: string },
        signer: TransactionModifyingSigner<string>,
    ) => Promise<{ success: boolean; transactionSignature?: string; error?: string }>;
}

const FREEZE_MODE: ModeConfig = {
    icon: Snowflake,
    iconClassName: 'text-blue-500',
    title: MODAL_TITLES.FREEZE_ACCOUNT,
    successTitle: MODAL_TITLES.ACCOUNT_FROZEN,
    description: MODAL_DESCRIPTIONS.FREEZE,
    warningTitle: MODAL_WARNINGS.ACCOUNT_FREEZE_TITLE,
    warningMessage: MODAL_WARNINGS.FREEZE_INFO,
    warningVariant: 'blue',
    actionLabel: MODAL_BUTTONS.FREEZE_ACCOUNT,
    loadingLabel: MODAL_BUTTONS.FREEZING,
    successMessage: MODAL_SUCCESS_MESSAGES.ACCOUNT_FROZEN,
    continueLabel: 'Freeze Another',
    actionClassName: 'bg-blue-500 hover:bg-blue-600 text-white',
    unauthorizedType: 'freeze',
    action: freezeTokenAccount,
};

const THAW_MODE: ModeConfig = {
    icon: Sun,
    iconClassName: 'text-amber-500',
    title: MODAL_TITLES.THAW_ACCOUNT,
    successTitle: MODAL_TITLES.ACCOUNT_THAWED,
    description: MODAL_DESCRIPTIONS.THAW,
    warningTitle: MODAL_WARNINGS.ACCOUNT_THAW_TITLE,
    warningMessage: MODAL_WARNINGS.THAW_INFO,
    warningVariant: 'amber',
    actionLabel: MODAL_BUTTONS.THAW_ACCOUNT,
    loadingLabel: MODAL_BUTTONS.THAWING,
    successMessage: MODAL_SUCCESS_MESSAGES.ACCOUNT_THAWED,
    continueLabel: 'Thaw Another',
    actionClassName: 'bg-amber-500 hover:bg-amber-600 text-white',
    unauthorizedType: 'thaw',
    action: thawTokenAccount,
};

interface FreezeThawModalContentProps {
    mintAddress: string;
    freezeAuthority?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
    mode: 'freeze' | 'thaw';
}

export function FreezeThawModalContent({
    mintAddress,
    freezeAuthority,
    transactionSendingSigner,
    mode,
}: FreezeThawModalContentProps) {
    const { cluster } = useConnector();
    const { validateSolanaAddress } = useInputValidation();
    const { hasFreezeAuthority, walletAddress } = useAuthority({ freezeAuthority });
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

    const [targetWallet, setTargetWallet] = useState('');

    const {
        icon: Icon,
        iconClassName,
        title,
        successTitle,
        description,
        warningTitle,
        warningMessage,
        warningVariant,
        actionLabel,
        loadingLabel,
        successMessage,
        actionClassName,
        unauthorizedType,
        action,
    } = mode === 'freeze' ? FREEZE_MODE : THAW_MODE;

    const handleAction = async () => {
        if (!walletAddress) {
            setError(MODAL_ERRORS.WALLET_NOT_CONNECTED);
            return;
        }

        if (!validateSolanaAddress(targetWallet)) {
            setError('Invalid wallet address');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

            const options = {
                walletAddress: targetWallet,
                mintAddress,
                rpcUrl,
            };

            const result = await action(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
            } else {
                setError(result.error || `${title} failed`);
            }
        } catch (err) {
            setError(humanizeError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setTargetWallet('');
        reset();
    };

    useEffect(() => {
        return () => resetForm();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Compute disabled label to help user understand what's needed
    const getDisabledLabel = (): string | undefined => {
        if (!walletAddress) return MODAL_BUTTONS.CONNECT_WALLET;
        if (!targetWallet.trim()) return MODAL_BUTTONS.ENTER_ADDRESS;
        if (targetWallet.trim() && !validateSolanaAddress(targetWallet)) return MODAL_BUTTONS.INVALID_ADDRESS;
        return undefined;
    };

    // Show unauthorized view if wallet doesn't have freeze authority
    if (!hasFreezeAuthority && freezeAuthority) {
        return (
            <ExtensionModal
                title={title}
                description={description}
                icon={Icon}
                iconClassName={iconClassName}
                isSuccess={false}
            >
                <UnauthorizedView
                    type={unauthorizedType}
                    authorityAddress={freezeAuthority}
                    walletAddress={walletAddress}
                />
            </ExtensionModal>
        );
    }

    return (
        <ExtensionModal
            title={title}
            successTitle={successTitle}
            description={description}
            icon={Icon}
            iconClassName={iconClassName}
            isSuccess={success}
            onClose={resetForm}
            successView={
                <TransactionSuccessView
                    title={`${successTitle}!`}
                    message={successMessage(targetWallet)}
                    transactionSignature={transactionSignature}
                    cluster={(cluster as { name?: string })?.name}
                />
            }
        >
            <SolanaAddressInput
                label="Wallet Address"
                value={targetWallet}
                onChange={setTargetWallet}
                placeholder="Enter wallet address to freeze..."
                helpText="The wallet address whose token account will be frozen or thawed"
                required
                disabled={isLoading}
            />

            <ModalWarning variant={warningVariant} title={warningTitle} icon={Icon}>
                {warningMessage}
            </ModalWarning>

            {freezeAuthority && (
                <div>
                    <label className="block text-sm font-medium mb-2">{MODAL_LABELS.FREEZE_AUTHORITY}</label>
                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                        {freezeAuthority}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{MODAL_HELP_TEXT.FREEZE_AUTHORITY_HELP}</p>
                </div>
            )}

            <ModalError error={error} />

            <ModalFooter
                isLoading={isLoading}
                onAction={handleAction}
                actionLabel={actionLabel}
                loadingLabel={loadingLabel}
                actionIcon={Icon}
                actionDisabled={!walletAddress || !targetWallet.trim() || !validateSolanaAddress(targetWallet)}
                disabledLabel={getDisabledLabel()}
                actionClassName={actionClassName}
            />
        </ExtensionModal>
    );
}
