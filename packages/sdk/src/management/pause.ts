import {
  type Address,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  type TransactionWithBlockhashLifetime,
  type TransactionMessageWithFeePayer,
  type TransactionVersion,
  type FullTransaction,
} from 'gill';
import {
  getPauseInstruction,
  getResumeInstruction,
} from '@solana-program/token-2022';
import { inspectToken } from '../inspection';

export interface PauseTokenOptions {
  mint: Address;
  pauseAuthority: TransactionSigner;
  feePayer: TransactionSigner;
}

export interface PauseTokenResult {
  success: boolean;
  error?: string;
  transactionSignature?: string;
  paused?: boolean;
}

export const MINT_ALREADY_PAUSED_ERROR = 'mint already paused';
export const MINT_NOT_PAUSED_ERROR = 'mint not currently paused';

/**
 * Gets the current pause state of a token
 * @param rpc - Solana RPC client
 * @param mint - Token mint address
 * @returns Promise that resolves to the pause state
 */
export const getTokenPauseState = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address
): Promise<boolean> => {
  try {
    const pausableConfigPda = await inspectToken(rpc, mint);
    const pausableConfig = pausableConfigPda.extensions.find(
      ext => ext.name === 'PausableConfig'
    )?.details;
    if (!pausableConfig) {
      return false;
    }
    return pausableConfig.paused as boolean;
  } catch {
    // Silently return false on error
    return false;
  }
};

export const createPauseTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  options: PauseTokenOptions
): Promise<{
  currentlyPaused: boolean;
  transactionMessage: FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >;
}> => {
  const { mint, feePayer, pauseAuthority } = options;
  const currentlyPaused = await getTokenPauseState(rpc, mint);
  if (currentlyPaused) {
    throw new Error(MINT_ALREADY_PAUSED_ERROR);
  }

  const instruction = getPauseInstruction({
    mint,
    authority: pauseAuthority,
  });

  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: 'confirmed' })
    .send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayer, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions([instruction], tx)
  );
  return { currentlyPaused, transactionMessage };
};

export const createResumeTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  options: PauseTokenOptions
): Promise<{
  currentlyPaused: boolean;
  transactionMessage: FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >;
}> => {
  const { mint, feePayer, pauseAuthority } = options;
  const currentlyPaused = await getTokenPauseState(rpc, mint);
  if (!currentlyPaused) {
    throw new Error(MINT_NOT_PAUSED_ERROR);
  }

  const instruction = getResumeInstruction({
    mint,
    authority: pauseAuthority,
  });

  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: 'confirmed' })
    .send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayer, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions([instruction], tx)
  );
  return { currentlyPaused, transactionMessage };
};
