import {
    createSolanaRpc,
    type Address,
    type Rpc,
    type SolanaRpcApi,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    getSignatureFromTransaction,
    createSolanaRpcSubscriptions,
    TransactionModifyingSigner,
    createTransaction,
} from 'gill';
import { getUpdateMultiplierScaledUiMintInstruction, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { getRpcUrl, getWsUrl } from '@/lib/solana/rpc';

export interface UpdateScaledUiMultiplierOptions {
    mint: string;
    multiplier: number;
    rpcUrl?: string;
}

export interface UpdateScaledUiMultiplierResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    multiplier?: number;
}

export const updateScaledUiMultiplier = async (
    options: UpdateScaledUiMultiplierOptions,
    signer: TransactionModifyingSigner,
): Promise<UpdateScaledUiMultiplierResult> => {
    try {
        if (!options.mint) throw new Error('Mint address is required');
        if (!Number.isFinite(options.multiplier) || options.multiplier <= 0) {
            throw new Error('Multiplier must be a positive number');
        }

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        const ix = getUpdateMultiplierScaledUiMintInstruction(
            {
                mint: options.mint as Address,
                authority: signer.address,
                effectiveTimestamp: 0,
                multiplier: options.multiplier,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );

        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
        const tx = createTransaction({
            feePayer: signer,
            version: 'legacy',
            latestBlockhash,
            instructions: [ix],
        });

        const signedTransaction = await signTransactionMessageWithSigners(tx);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });
        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            multiplier: options.multiplier,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
