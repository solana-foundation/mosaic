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
  signAndSendTransactionMessageWithSigners,
  type Instruction,
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
    return pausableConfig.paused;
  } catch (error) {
    // Silently return false on error
    return false;
  }
};

export const getTogglePauseInstruction = async (
  rpc: Rpc<SolanaRpcApi>,
  options: PauseTokenOptions
): Promise<{ currentlyPaused: boolean; instruction: Instruction<string> }> => {
  const { mint, pauseAuthority } = options;
  const currentlyPaused = await getTokenPauseState(rpc, mint);
  const instruction = currentlyPaused
    ? getResumeInstruction({
        mint,
        authority: pauseAuthority,
      })
    : getPauseInstruction({
        mint,
        authority: pauseAuthority,
      });
  return { currentlyPaused, instruction };
};

/**
 * Toggles the pause state of a token (pause/unpause)
 * @param rpc - Solana RPC client
 * @param options - Configuration options for pausing
 * @returns Promise that resolves to pause result with signature
 */
export const togglePauseToken = async (
  rpc: Rpc<SolanaRpcApi>,
  options: PauseTokenOptions
): Promise<PauseTokenResult> => {
  try {
    const { feePayer } = options;

    // Get toggle pause instruction
    const { currentlyPaused, instruction } = await getTogglePauseInstruction(
      rpc,
      options
    );

    // Get latest blockhash
    const { value: latestBlockhash } = await rpc
      .getLatestBlockhash({ commitment: 'confirmed' })
      .send();

    // Create and send transaction
    const transactionMessage = await pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(feePayer, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstructions([instruction], tx)
    );

    const signature =
      await signAndSendTransactionMessageWithSigners(transactionMessage);

    // Convert signature to base58 string
    const base58Signature = Buffer.from(signature).toString('base64');

    return {
      success: true,
      transactionSignature: base58Signature,
      paused: !currentlyPaused, // Return the new state
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to toggle pause state',
    };
  }
};

/**
 * Pauses a token
 * @param rpc - Solana RPC client
 * @param options - Configuration options for pausing
 * @returns Promise that resolves to pause result with signature
 */
export const pauseToken = async (
  rpc: Rpc<SolanaRpcApi>,
  options: PauseTokenOptions
): Promise<PauseTokenResult> => {
  const currentlyPaused = await getTokenPauseState(rpc, options.mint);
  if (currentlyPaused) {
    return {
      success: false,
      error: 'Token is already paused',
    };
  }
  return togglePauseToken(rpc, options);
};

/**
 * Unpauses a token
 * @param rpc - Solana RPC client
 * @param options - Configuration options for unpausing
 * @returns Promise that resolves to unpause result with signature
 */
export const unpauseToken = async (
  rpc: Rpc<SolanaRpcApi>,
  options: PauseTokenOptions
): Promise<PauseTokenResult> => {
  const currentlyPaused = await getTokenPauseState(rpc, options.mint);
  if (!currentlyPaused) {
    return {
      success: false,
      error: 'Token is not paused',
    };
  }
  return togglePauseToken(rpc, options);
};
