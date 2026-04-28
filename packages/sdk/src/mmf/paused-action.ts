import {
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    type Address,
    appendTransactionMessageInstructions,
    createTransactionMessage,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS, getPauseInstruction, getResumeInstruction } from '@solana-program/token-2022';
import type { FullTransaction } from '../transaction-util';

/**
 * Builds a transaction that executes admin instructions on a globally-paused mint:
 * [resume, ...instructions, pause]. The mint must be paused before this transaction
 * lands; it is paused again at the end of the same atomic transaction.
 *
 * Use this when the issuer policy keeps the mint globally paused and only allows
 * specific admin actions (mint, burn, force-transfer, etc.) inside this window.
 */
export const createPausedActionTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: {
        mint: Address;
        pauseAuthority: TransactionSigner<string>;
        feePayer: TransactionSigner<string>;
        instructions: Instruction[];
    },
): Promise<FullTransaction> => {
    const { mint, pauseAuthority, feePayer, instructions } = input;

    const resume = getResumeInstruction(
        { mint, authority: pauseAuthority },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    );
    const pause = getPauseInstruction(
        { mint, authority: pauseAuthority },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    );

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions([resume, ...instructions, pause], m),
    ) as FullTransaction;
};
