import {
    type Address,
    type Rpc,
    type SolanaRpcApi,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    getSignatureFromTransaction,
    createSolanaRpcSubscriptions,
    TransactionModifyingSigner,
    isAddress,
    assertIsTransactionWithBlockhashLifetime,
    fetchEncodedAccount,
    getAddressEncoder,
    getProgramDerivedAddress,
    getUtf8Encoder,
} from '@solana/kit';
import {
    ABL_PROGRAM_ID,
    createAddToBlocklistTransaction,
    createRemoveFromBlocklistTransaction,
    createAddToAllowlistTransaction,
    createRemoveFromAllowlistTransaction,
    getListWallets,
    getListConfigPda,
} from '@solana/mosaic-sdk';
import { fetchMaybeListConfig } from '@solana/token-acl-gate-sdk';
import { getCommitment } from '@/lib/solana/rpc';
import { humanizeError } from '@/lib/errors';
import { type AccessListState, attachedListConfig, resolveAccessListState } from './access-list-state';

/**
 * Reads a mint's sRFC-37 access list from chain: the list attached to the mint
 * (through the ABL program's thaw extra-account-metas), its mode and members,
 * and whether the connected wallet is the authority that can change it.
 *
 * Missing accounts are part of the returned state; only a failed RPC call
 * becomes `status: 'error'`.
 */
export async function readAccessListState(
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    connectedWallet: Address | null,
): Promise<AccessListState> {
    try {
        const [extraMetasAddress] = await getProgramDerivedAddress({
            programAddress: ABL_PROGRAM_ID,
            seeds: [getUtf8Encoder().encode('thaw_extra_account_metas'), getAddressEncoder().encode(mint)],
        });
        const extraMetasAccount = await fetchEncodedAccount(rpc, extraMetasAddress);
        const extraMetas = extraMetasAccount.exists ? new Uint8Array(extraMetasAccount.data) : null;

        const listConfig = attachedListConfig(extraMetas);
        const listConfigAccount = listConfig ? await fetchMaybeListConfig(rpc, listConfig) : null;
        const wallets = listConfig && listConfigAccount?.exists ? await getListWallets({ rpc, listConfig }) : [];
        const derivedListConfigForWallet = connectedWallet
            ? await getListConfigPda({ authority: connectedWallet, mint })
            : null;

        return resolveAccessListState({
            extraMetas,
            listConfigAccount,
            wallets,
            connectedWallet,
            derivedListConfigForWallet,
            ablProgramId: ABL_PROGRAM_ID,
        });
    } catch (error) {
        return {
            status: 'error',
            message: humanizeError(error, 'Could not read the access list') || 'Could not read the access list',
        };
    }
}

export interface BlocklistOptions {
    mintAddress: string;
    walletAddress: string;
}

export interface BlocklistResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
}

/**
 * Validates blocklist options by checking required addresses and their format
 * @param options - Blocklist configuration options containing mintAddress and walletAddress
 * @throws Error if mintAddress or walletAddress is missing
 * @throws Error if mintAddress or walletAddress has invalid Solana address format
 */
function validateBlocklistOptions(options: BlocklistOptions): void {
    if (!options.mintAddress || !options.walletAddress) {
        throw new Error('Mint address and wallet address are required');
    }

    // Validate Solana address format
    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }
    if (!isAddress(options.walletAddress)) {
        throw new Error('Invalid wallet address format');
    }

    return;
}

/**
 * Adds an address to the blocklist for a token mint
 * @param rpc - Solana RPC client instance
 * @param options - Blocklist configuration options containing mint address and wallet address
 * @param signer - Transaction signing signer instance
 * @param rpcUrl - RPC endpoint URL for transaction confirmation
 * @returns Promise that resolves to blocklist result with success status, optional error, and transaction signature
 */
export const addAddressToBlocklist = async (
    rpc: Rpc<SolanaRpcApi>,
    options: BlocklistOptions,
    signer: TransactionModifyingSigner,
    rpcUrl: string,
): Promise<BlocklistResult> => {
    try {
        // Validate options
        validateBlocklistOptions(options);

        // Create RPC subscriptions for confirmation
        const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace('http', 'ws'));

        // Create blocklist transaction using SDK
        const transaction = await createAddToBlocklistTransaction(
            rpc,
            options.mintAddress as Address,
            options.walletAddress as Address,
            signer,
        );

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
        });
        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};

export const removeAddressFromBlocklist = async (
    rpc: Rpc<SolanaRpcApi>,
    options: BlocklistOptions,
    signer: TransactionModifyingSigner,
    rpcUrl: string,
): Promise<BlocklistResult> => {
    try {
        // Validate options
        validateBlocklistOptions(options);

        // Create RPC subscriptions for confirmation
        const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace('http', 'ws'));

        // Create blocklist transaction using SDK
        const transaction = await createRemoveFromBlocklistTransaction(
            rpc,
            options.mintAddress as Address,
            options.walletAddress as Address,
            signer,
        );

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
        });
        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};

export const addAddressToAllowlist = async (
    rpc: Rpc<SolanaRpcApi>,
    options: BlocklistOptions,
    signer: TransactionModifyingSigner,
    rpcUrl: string,
): Promise<BlocklistResult> => {
    try {
        // Validate options
        validateBlocklistOptions(options);

        // Create RPC subscriptions for confirmation
        const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace('http', 'ws'));

        // Create allowlist transaction using SDK
        const transaction = await createAddToAllowlistTransaction(
            rpc,
            options.mintAddress as Address,
            options.walletAddress as Address,
            signer,
        );

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
        });
        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};

export const removeAddressFromAllowlist = async (
    rpc: Rpc<SolanaRpcApi>,
    options: BlocklistOptions,
    signer: TransactionModifyingSigner,
    rpcUrl: string,
): Promise<BlocklistResult> => {
    try {
        // Validate options
        validateBlocklistOptions(options);

        // Create RPC subscriptions for confirmation
        const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace('http', 'ws'));

        // Create allowlist removal transaction using SDK
        const transaction = await createRemoveFromAllowlistTransaction(
            rpc,
            options.mintAddress as Address,
            options.walletAddress as Address,
            signer,
        );

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
        });
        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
