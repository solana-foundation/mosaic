import { useState, useContext } from 'react';
import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';

export interface TransactionModalState {
  isLoading: boolean;
  error: string;
  success: boolean;
  transactionSignature: string;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setSuccess: (success: boolean) => void;
  setTransactionSignature: (signature: string) => void;
  reset: () => void;
}

/**
 * Hook to manage common transaction modal state
 */
export function useTransactionModal(): TransactionModalState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState('');

  const reset = () => {
    setIsLoading(false);
    setError('');
    setSuccess(false);
    setTransactionSignature('');
  };

  return {
    isLoading,
    error,
    success,
    transactionSignature,
    setIsLoading,
    setError,
    setSuccess,
    setTransactionSignature,
    reset,
  };
}

/**
 * Hook to check wallet connection
 */
export function useWalletConnection() {
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);

  const checkConnection = (): boolean => {
    return !!selectedWalletAccount?.address;
  };

  const getWalletAddress = (): string | null => {
    return selectedWalletAccount?.address?.toString() || null;
  };

  return {
    isConnected: checkConnection(),
    walletAddress: getWalletAddress(),
    selectedWalletAccount,
  };
}
