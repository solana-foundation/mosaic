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
} from '@solana/kit';
import { getUpdateMultiplierScaledUiMintInstruction, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import type { FullTransaction } from '../transaction-util.js';

export interface UpdateScaledUiMultiplierOptions {
    mint: Address;
    /** Current scaled UI amount authority; must sign the transaction. */
    authority: TransactionSigner;
    /** New multiplier; must be a finite number greater than 0. */
    multiplier: number;
    /**
     * Unix timestamp in seconds at which the new multiplier takes effect. Defaults to `0`, which
     * applies it immediately. Either way this replaces any change already scheduled on the mint.
     */
    effectiveTimestamp?: bigint | number;
    feePayer: TransactionSigner;
}

/**
 * Creates a transaction that updates a mint's Scaled UI Amount multiplier, signed by the
 * scaled UI amount authority.
 */
export const createUpdateScaledUiMultiplierTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    options: UpdateScaledUiMultiplierOptions,
): Promise<FullTransaction> => {
    const { mint, authority, multiplier, effectiveTimestamp = 0, feePayer } = options;

    if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier <= 0) {
        throw new Error('Multiplier must be a finite number greater than 0');
    }
    const isWholeNumber =
        typeof effectiveTimestamp === 'bigint' ||
        (typeof effectiveTimestamp === 'number' && Number.isSafeInteger(effectiveTimestamp));
    if (!isWholeNumber || BigInt(effectiveTimestamp) < 0n) {
        throw new Error('Effective timestamp must be a whole number of seconds, 0 or greater');
    }
    const timestamp = BigInt(effectiveTimestamp);

    const instruction = getUpdateMultiplierScaledUiMintInstruction(
        {
            mint,
            authority,
            multiplier,
            effectiveTimestamp: timestamp,
        },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    );

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions([instruction], m),
    ) as FullTransaction;
};
