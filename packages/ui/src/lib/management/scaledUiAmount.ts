import {
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
  createTransaction,
} from 'gill';
import { getUpdateMultiplierScaledUiMintInstruction } from 'gill/programs/token';
import bs58 from 'bs58';

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
  signer: TransactionSendingSigner
): Promise<UpdateScaledUiMultiplierResult> => {
  try {
    if (!options.mint) throw new Error('Mint address is required');
    if (!Number.isFinite(options.multiplier) || options.multiplier <= 0) {
      throw new Error('Multiplier must be a positive number');
    }

    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    const ix = getUpdateMultiplierScaledUiMintInstruction(
      {
        mint: options.mint as Address,
      },
      {
        multiplier: options.multiplier,
      }
    );

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const tx = createTransaction({
      feePayer: signer,
      version: 'legacy',
      latestBlockhash,
      instructions: [ix],
    });

    const signature = await signAndSendTransactionMessageWithSigners(tx);
    return {
      success: true,
      transactionSignature: bs58.encode(signature),
      multiplier: options.multiplier,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
