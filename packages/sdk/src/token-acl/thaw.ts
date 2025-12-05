import {
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    type Address,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import { findMintConfigPda, getThawInstruction } from '@token-acl/sdk';
import { getThawAccountInstruction, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { TOKEN_ACL_PROGRAM_ID } from './utils';
import { getMintDetails } from '../transaction-util';

/**
 * Generates instructions for thawing a token account.
 *
 * This function creates instructions to thaw a token account. It automatically
 * detects whether the token uses Token ACL or standard SPL Token-2022 freeze authority
 * and uses the appropriate instruction.
 *
 * @param input - Configuration parameters for thawing a token account
 * @param input.authority - The authority signer who can thaw the token account
 * @param input.tokenAccount - The token account address to thaw
 * @returns Promise containing the instructions for thawing a token account
 */
export const getThawInstructions = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    authority: TransactionSigner<string>;
    tokenAccount: Address;
}): Promise<Instruction<string>[]> => {
    const { value: accountInfo } = await input.rpc
        .getAccountInfo(input.tokenAccount, { encoding: 'jsonParsed' })
        .send();
    if (!accountInfo) {
        throw new Error('Token account not found');
    }

    // Use jsonParsed data which works for both regular SPL and Token-2022 accounts
    if (!('parsed' in accountInfo.data) || !accountInfo.data.parsed?.info) {
        throw new Error('Failed to parse token account data');
    }

    const tokenInfo = accountInfo.data.parsed.info as {
        mint: Address;
        owner: Address;
        tokenAmount: { amount: string };
        state: string;
    };

    const token = {
        mint: tokenInfo.mint,
        owner: tokenInfo.owner,
        amount: BigInt(tokenInfo.tokenAmount.amount),
        state: tokenInfo.state,
    };

    // Get mint details to determine if this token uses Token ACL
    const { freezeAuthority, programAddress } = await getMintDetails(input.rpc, token.mint);

    // Check if freeze authority is the Token ACL program
    if (freezeAuthority === TOKEN_ACL_PROGRAM_ID) {
        // Use Token ACL instruction
        const mintConfigPda = await findMintConfigPda({ mint: token.mint }, { programAddress: TOKEN_ACL_PROGRAM_ID });

        const thawInstruction = getThawInstruction(
            {
                authority: input.authority,
                mintConfig: mintConfigPda[0],
                mint: token.mint,
                tokenAccount: input.tokenAccount,
            },
            { programAddress: TOKEN_ACL_PROGRAM_ID },
        );

        return [thawInstruction];
    }

    // Use standard SPL Token-2022 thaw instruction
    const thawInstruction = getThawAccountInstruction(
        {
            account: input.tokenAccount,
            mint: token.mint,
            owner: input.authority,
        },
        {
            programAddress: programAddress as typeof TOKEN_2022_PROGRAM_ADDRESS,
        },
    );

    return [thawInstruction];
};

/**
 * Creates a complete transaction for thawing a token account.
 *
 * This function builds a full transaction that can be signed and sent to thaw a token account.
 * The transaction includes the necessary instructions and uses the latest blockhash for proper construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who can thaw the token account
 * @param input.tokenAccount - The token account address to thaw
 * @returns Promise containing the full transaction for thawing a token account
 */
export const getThawTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    tokenAccount: Address;
}): Promise<FullTransaction> => {
    const instructions = await getThawInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(input.payer.address, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};
