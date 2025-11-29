import {
    createSolanaRpc,
    createTransaction,
    type Address,
    type Rpc,
    type SolanaRpcApi,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    getSignatureFromTransaction,
    createSolanaRpcSubscriptions,
    TransactionModifyingSigner,
    isAddress,
} from 'gill';
import { getCloseAccountInstruction, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { getRpcUrl, getWsUrl } from '@/lib/solana/rpc';
import { resolveTokenAccount } from '@mosaic/sdk';

export interface CloseAccountOptions {
    mintAddress: string;
    destination?: string; // Address to send reclaimed SOL, defaults to wallet
    rpcUrl?: string;
}

export interface CloseAccountResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    closedAccount?: string;
    destination?: string;
}

/**
 * Validates close account options
 * @param options - Close account configuration options
 * @throws Error if validation fails
 */
function validateCloseAccountOptions(options: CloseAccountOptions): void {
    if (!options.mintAddress) {
        throw new Error('Mint address is required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }

    if (options.destination && !isAddress(options.destination)) {
        throw new Error('Invalid destination address format');
    }
}

/**
 * Closes an empty token account and reclaims the rent.
 * The token account must have a zero balance.
 *
 * @param options - Configuration options for closing the account
 * @param signer - Transaction sending signer instance (must be token account owner)
 * @returns Promise that resolves to close result with signature and details
 */
export const closeTokenAccount = async (
    options: CloseAccountOptions,
    signer: TransactionModifyingSigner,
): Promise<CloseAccountResult> => {
    try {
        validateCloseAccountOptions(options);

        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const signerAddress = walletPublicKey.toString();
        const destinationAddress = options.destination || signerAddress;

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Resolve the wallet's token account
        const { tokenAccount, isInitialized } = await resolveTokenAccount(
            rpc,
            signerAddress as Address,
            options.mintAddress as Address,
        );

        if (!isInitialized) {
            throw new Error('You do not have a token account for this mint');
        }

        // Create close account instruction
        const closeInstruction = getCloseAccountInstruction(
            {
                account: tokenAccount,
                destination: destinationAddress as Address,
                owner: signer,
            },
            {
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            },
        );

        // Get latest blockhash
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

        // Create transaction
        const transaction = createTransaction({
            feePayer: signer,
            version: 'legacy',
            latestBlockhash,
            instructions: [closeInstruction],
        });

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            closedAccount: tokenAccount.toString(),
            destination: destinationAddress,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
