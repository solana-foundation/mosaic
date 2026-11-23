import {
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    type Address,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { resolveFeePayerAndAuthority } from '../signers.js';
import type { FullTransaction } from '../transaction-util.js';
import { findMintConfigPda, getTogglePermissionlessInstructionsInstruction } from '@solana/token-acl-sdk';
import { TOKEN_ACL_PROGRAM_ID } from './utils.js';

/**
 * Generates instructions for enabling permissionless thaw operations on a mint.
 *
 * This function creates instructions to enable permissionless thaw functionality
 * for a specific mint. When enabled, any user can thaw frozen token accounts
 * without requiring the freeze authority's signature, while freeze operations
 * remain restricted to the authority.
 *
 * @param input - Configuration parameters for enabling permissionless thaw
 * @param input.authority - The authority signer who can modify the thaw configuration
 * @param input.mint - The mint address for which to enable permissionless thaw
 * @returns Promise containing the instructions for enabling permissionless thaw
 */
export const getEnablePermissionlessThawInstructions = async (input: {
    authority: TransactionSigner<string>;
    mint: Address;
}): Promise<Instruction<string>[]> => {
    const mintConfigPda = await findMintConfigPda({ mint: input.mint }, { programAddress: TOKEN_ACL_PROGRAM_ID });

    const enablePermissionlessThawInstruction = getTogglePermissionlessInstructionsInstruction(
        {
            authority: input.authority,
            mintConfig: mintConfigPda[0],
            thawEnabled: true,
            freezeEnabled: false,
        },
        { programAddress: TOKEN_ACL_PROGRAM_ID },
    );

    return [enablePermissionlessThawInstruction];
};

/**
 * Creates a complete transaction for enabling permissionless thaw operations.
 *
 * This function builds a full transaction that can be signed and sent to enable
 * permissionless thaw functionality for a specific mint. The transaction includes
 * the necessary instructions and uses the latest blockhash for proper construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who can modify the thaw configuration
 * @param input.mint - The mint address for which to enable permissionless thaw
 * @returns Promise containing the full transaction for enabling permissionless thaw
 */
export const getEnablePermissionlessThawTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    mint: Address;
}): Promise<FullTransaction> => {
    // One signer object per key: Kit refuses to sign a payer and an authority that are
    // distinct signer objects for the same address.
    const { feePayerSigner: payer, authoritySigner: authority } = resolveFeePayerAndAuthority(
        input.payer,
        input.authority,
    );
    const instructions = await getEnablePermissionlessThawInstructions({ ...input, authority });
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(payer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};
