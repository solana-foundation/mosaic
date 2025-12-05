import type { Address, Rpc, SolanaRpcApi, TransactionSigner, Instruction } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    createNoopSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
} from '@solana/kit';
import { getBurnCheckedInstruction, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
    resolveTokenAccount,
    decimalAmountToRaw,
    getMintDetails,
    isDefaultAccountStateSetFrozen,
} from '../transaction-util';
import { TOKEN_ACL_PROGRAM_ID, getThawPermissionlessInstructions } from '../token-acl';

/**
 * Creates a transaction to force burn tokens using the permanent delegate extension.
 * This allows the permanent delegate to burn tokens from any account regardless of approval.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param fromAccount - The account address to burn tokens from (wallet or ATA)
 * @param decimalAmount - The decimal amount to burn (e.g., 1.5)
 * @param permanentDelegate - The permanent delegate authority signer
 * @param feePayer - The fee payer signer
 * @returns A promise that resolves to a FullTransaction object for force burning tokens
 */
export const createForceBurnTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    fromAccount: Address,
    decimalAmount: number,
    permanentDelegate: Address | TransactionSigner<string>,
    feePayer: Address | TransactionSigner<string>,
): Promise<FullTransaction> => {
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
    const permanentDelegateSigner =
        typeof permanentDelegate === 'string' ? createNoopSigner(permanentDelegate) : permanentDelegate;

    // Get mint info to determine decimals
    const { decimals, freezeAuthority, extensions } = await getMintDetails(rpc, mint);
    const enableSrfc37 = freezeAuthority === TOKEN_ACL_PROGRAM_ID && isDefaultAccountStateSetFrozen(extensions);

    // Convert decimal amount to raw amount
    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

    // Resolve source token account
    const { tokenAccount: sourceTokenAccount, isFrozen } = await resolveTokenAccount(rpc, fromAccount, mint);

    const instructions: Instruction[] = [];

    // Thaw the account if frozen and SRFC37 is enabled
    if (isFrozen && (enableSrfc37 ?? false)) {
        const thawInstructions = await getThawPermissionlessInstructions({
            authority: feePayerSigner,
            mint,
            tokenAccount: sourceTokenAccount,
            tokenAccountOwner: fromAccount,
            rpc,
        });
        instructions.push(...thawInstructions);
    }

    // Add force burn instruction using permanent delegate authority
    // The permanent delegate can burn tokens without approval from the owner
    instructions.push(
        getBurnCheckedInstruction(
            {
                account: sourceTokenAccount,
                mint,
                authority: permanentDelegateSigner,
                amount: rawAmount,
                decimals,
            },
            {
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            },
        ),
    );

    // Get latest blockhash for transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(feePayerSigner.address, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

/**
 * Validates that a mint has the permanent delegate extension enabled
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param permanentDelegateAddress - Expected permanent delegate address
 * @returns Promise that resolves if validation passes, throws if not
 */
export async function validatePermanentDelegateForBurn(
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    permanentDelegateAddress: Address,
): Promise<void> {
    const { extensions } = await getMintDetails(rpc, mint);

    // Check if permanent delegate extension exists
    const permanentDelegateExtension = extensions.find(
        ext => 'extension' in ext && ext.extension === 'permanentDelegate',
    );

    if (!permanentDelegateExtension) {
        throw new Error(`Mint ${mint} does not have permanent delegate extension enabled`);
    }

    const delegateAddress = permanentDelegateExtension.state?.delegate;
    if (delegateAddress !== permanentDelegateAddress) {
        throw new Error(
            `Permanent delegate mismatch. Expected: ${permanentDelegateAddress}, Found: ${delegateAddress}`,
        );
    }
}
