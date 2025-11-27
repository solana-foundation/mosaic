import { useState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { forceBurnTokens, type ForceBurnOptions } from '@/lib/management/force-burn';
import { TransactionModifyingSigner } from '@solana/signers';
import { Flame } from 'lucide-react';
import { useConnector } from '@solana/connector/react';

import { BaseModal } from '@/components/shared/modals/base-modal';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { WarningBanner } from '@/components/shared/modals/warning-banner';
import { SolanaAddressInput } from '@/components/shared/form/solana-address-input';
import { AmountInput } from '@/components/shared/form/amount-input';
import { useTransactionModal, useWalletConnection } from '@/hooks/use-transaction-modal';
import { useInputValidation } from '@/hooks/use-input-validation';

interface ForceBurnModalProps {
    isOpen: boolean;
    onClose: () => void;
    mintAddress: string;
    permanentDelegate?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function ForceBurnModalRefactored({
    isOpen,
    onClose,
    mintAddress,
    permanentDelegate,
    transactionSendingSigner,
}: ForceBurnModalProps) {
    const { walletAddress } = useWalletConnection();
    const headerId = useId();
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

    const [fromAddress, setFromAddress] = useState('');
    const [amount, setAmount] = useState('');

    const handleForceBurn = async () => {
        if (!walletAddress) {
            setError('Wallet not connected');
            return;
        }

        if (!validateSolanaAddress(fromAddress)) {
            setError('Please enter a valid source address');
            return;
        }

        if (!validateAmount(amount)) {
            setError('Please enter a valid amount');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // Get RPC URL from cluster, environment variable, or default to devnet
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
            } else {
                setError(result.error || 'Force burn failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setFromAddress('');
        setAmount('');
        reset();
        onClose();
    };

    const handleContinue = () => {
        setFromAddress('');
        setAmount('');
        reset();
    };

    const modalTitle = success ? 'Force Burn Successful' : 'Force Burn Tokens';

    return (
        <BaseModal isOpen={isOpen} onClose={handleClose} labelledBy={headerId}>
            <div className="flex items-center gap-2 mb-4">
                <Flame className="h-5 w-5 text-red-500" />
                <h3 id={headerId} className="text-lg font-semibold">
                    {modalTitle}
                </h3>
            </div>

            {success ? (
                <TransactionSuccessView
                    title="Tokens burned successfully!"
                    message={`${amount} tokens have been permanently burned from ${fromAddress.slice(0, 8)}...${fromAddress.slice(-6)}`}
                    transactionSignature={transactionSignature}
                    cluster={(cluster as { name?: string })?.name}
                    onClose={handleClose}
                    onContinue={handleContinue}
                    continueLabel="Burn More"
                />
            ) : (
                <div className="space-y-4">
                    <WarningBanner
                        title="Warning: Irreversible Action"
                        message="Force burning will permanently destroy tokens from any account. This action cannot be undone. Only use this for compliance or emergency purposes."
                        variant="danger"
                    />

                    <SolanaAddressInput
                        label="Burn From Address"
                        value={fromAddress}
                        onChange={setFromAddress}
                        placeholder="Enter wallet or token account address..."
                        helpText="The account from which tokens will be burned"
                        required
                        disabled={isLoading}
                    />

                    <AmountInput
                        label="Amount to Burn"
                        value={amount}
                        onChange={setAmount}
                        placeholder="Enter amount to burn..."
                        helpText="Number of tokens to permanently destroy"
                        required
                        disabled={isLoading}
                    />

                    {permanentDelegate && (
                        <div>
                            <label className="block text-sm font-medium mb-2">Permanent Delegate Authority</label>
                            <input
                                type="text"
                                value={permanentDelegate}
                                readOnly
                                className="w-full p-2 border rounded-md bg-gray-50 text-sm"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Only the permanent delegate can execute force burns
                            </p>
                        </div>
                    )}

                    {error && <div className="text-red-600 text-sm">{error}</div>}

                    <div className="flex space-x-2 mt-6">
                        <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleForceBurn}
                            disabled={
                                isLoading ||
                                !fromAddress.trim() ||
                                !amount.trim() ||
                                !validateSolanaAddress(fromAddress) ||
                                !validateAmount(amount)
                            }
                            className="flex-1 bg-red-600 hover:bg-red-700"
                        >
                            {isLoading ? (
                                <>
                                    <span className="animate-spin mr-2">⏳</span>
                                    Burning...
                                </>
                            ) : (
                                <>
                                    <Flame className="h-4 w-4 mr-2" />
                                    Force Burn
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </BaseModal>
    );
}
