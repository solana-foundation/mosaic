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
import { getBurnCheckedInstruction, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { getRpcUrl, getWsUrl } from '@/lib/solana/rpc';
import { getMintDetails, resolveTokenAccount, decimalAmountToRaw } from '@mosaic/sdk';

export interface BurnOptions {
    mintAddress: string;
    amount: string;
    rpcUrl?: string;
}

export interface BurnResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    burnedAmount?: string;
}

/**
 * Validates burn options
 * @param options - Burn configuration options
 * @throws Error if validation fails
 */
function validateBurnOptions(options: BurnOptions): void {
    if (!options.mintAddress || !options.amount) {
        throw new Error('Mint address and amount are required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }

    const amount = parseFloat(options.amount);
    if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number');
    }
}

/**
 * Burns tokens from the connected wallet.
 * This is a self-burn operation - the wallet owner burns their own tokens.
 *
 * @param options - Configuration options for burning
 * @param signer - Transaction sending signer instance (token owner)
 * @returns Promise that resolves to burn result with signature and details
 */
export const burnTokens = async (options: BurnOptions, signer: TransactionModifyingSigner): Promise<BurnResult> => {
    try {
        validateBurnOptions(options);

        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const signerAddress = walletPublicKey.toString();

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Get mint details for decimals
        const { decimals } = await getMintDetails(rpc, options.mintAddress as Address);

        // Convert decimal amount to raw amount
        const rawAmount = decimalAmountToRaw(parseFloat(options.amount), decimals);

        // Resolve the wallet's token account
        const { tokenAccount, isInitialized } = await resolveTokenAccount(
            rpc,
            signerAddress as Address,
            options.mintAddress as Address,
        );

        if (!isInitialized) {
            throw new Error('You do not have a token account for this mint');
        }

        // Create burn instruction
        const burnInstruction = getBurnCheckedInstruction(
            {
                account: tokenAccount,
                mint: options.mintAddress as Address,
                authority: signer,
                amount: rawAmount,
                decimals,
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
            instructions: [burnInstruction],
        });

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            burnedAmount: options.amount,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
