import {
    createSolanaRpc,
    type Address,
    type Rpc,
    type SolanaRpcApi,
    type TransactionModifyingSigner,
    isAddress,
} from '@solana/kit';
import {
    getTokenPauseState,
    type PauseTokenResult,
    createPauseTransaction,
    createResumeTransaction,
} from '@solana/mosaic-sdk';
import { getRpcUrl } from '@/lib/solana/rpc';
import { executeTokenAction } from './token-action';

export interface PauseOptions {
    mintAddress: string;
    pauseAuthority?: string;
    feePayer?: string;
    rpcUrl?: string;
}

/**
 * Validates pause options
 * @param options - Pause configuration options
 * @throws Error if validation fails
 */
function validatePauseOptions(options: PauseOptions): void {
    if (!options.mintAddress) {
        throw new Error('Mint address is required');
    }

    // Validate Solana address format
    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }
}

/**
 * Creates a validation function for pause/unpause operations that includes authority checks
 */
function createPauseValidator(signer: TransactionModifyingSigner, action: 'pause' | 'unpause') {
    return (options: PauseOptions): void => {
        validatePauseOptions(options);

        const signerAddress = signer.address;
        const pauseAuthorityAddress = options.pauseAuthority || signerAddress;

        if (signerAddress !== pauseAuthorityAddress) {
            throw new Error(
                `Only the pause authority can ${action} tokens. Please ensure the connected wallet is the pause authority.`,
            );
        }
    };
}

/**
 * Pauses a token using the wallet standard transaction signer
 * @param options - Configuration options for pausing
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to pause result with signature
 */
export const pauseTokenWithWallet = (
    options: PauseOptions,
    signer: TransactionModifyingSigner,
): Promise<PauseTokenResult> =>
    executeTokenAction<PauseOptions, PauseTokenResult>({
        options,
        signer,
        validate: createPauseValidator(signer, 'pause'),
        buildTransaction: async ({ rpc, signer, options }) => {
            const { transactionMessage } = await createPauseTransaction(rpc, {
                mint: options.mintAddress as Address,
                pauseAuthority: signer,
                feePayer: signer,
            });
            return transactionMessage;
        },
        buildSuccessResult: () => ({
            paused: true,
        }),
    });

/**
 * Unpauses a token using the wallet standard transaction signer
 * @param options - Configuration options for unpausing
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to unpause result with signature
 */
export const unpauseTokenWithWallet = (
    options: PauseOptions,
    signer: TransactionModifyingSigner,
): Promise<PauseTokenResult> =>
    executeTokenAction<PauseOptions, PauseTokenResult>({
        options,
        signer,
        validate: createPauseValidator(signer, 'unpause'),
        buildTransaction: async ({ rpc, signer, options }) => {
            const { transactionMessage } = await createResumeTransaction(rpc, {
                mint: options.mintAddress as Address,
                pauseAuthority: signer,
                feePayer: signer,
            });
            return transactionMessage;
        },
        buildSuccessResult: () => ({
            paused: false,
        }),
    });

/**
 * Gets the current pause state of a token
 * @param mintAddress - Token mint address
 * @param rpcUrl - Optional RPC URL
 * @returns Promise that resolves to the pause state
 * @throws Error if checking the pause state fails, with context including mintAddress
 */
export const checkTokenPauseState = async (mintAddress: string, rpcUrl?: string): Promise<boolean> => {
    try {
        if (!isAddress(mintAddress)) {
            throw new Error('Invalid mint address format');
        }

        const url = getRpcUrl(rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(url);

        return await getTokenPauseState(rpc, mintAddress as Address);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to check pause state for mint ${mintAddress}: ${errorMessage}`);
    }
};
