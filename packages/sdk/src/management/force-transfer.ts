import type {
    Address,
    Rpc,
    SolanaRpcApi,
    TransactionSigner,
    Instruction,
} from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import { createNoopSigner, pipe, createTransactionMessage, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions } from '@solana/kit';
import {
    getCreateAssociatedTokenIdempotentInstruction,
    getTransferCheckedInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import {
    resolveTokenAccount,
    decimalAmountToRaw,
    getMintDetails,
    isDefaultAccountStateSetFrozen,
} from '../transaction-util';
import { TOKEN_ACL_PROGRAM_ID, getThawPermissionlessInstructions } from '../token-acl';

/**
 * Creates a transaction to force transfer tokens using the permanent delegate extension.
 * This allows the permanent delegate to transfer tokens from any account regardless of approval.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param fromAccount - The source account address (wallet or ATA)
 * @param toAccount - The destination account address (wallet or ATA)
 * @param decimalAmount - The decimal amount to transfer (e.g., 1.5)
 * @param permanentDelegate - The permanent delegate authority signer
 * @param feePayer - The fee payer signer
 * @returns A promise that resolves to a FullTransaction object for force transferring tokens
 */
export const createForceTransferTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    fromAccount: Address,
    toAccount: Address,
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

    // Resolve source and destination token accounts
    const { tokenAccount: sourceTokenAccount } = await resolveTokenAccount(rpc, fromAccount, mint);
    const {
        tokenAccount: destTokenAccount,
        isInitialized: destIsInitialized,
        isFrozen,
    } = await resolveTokenAccount(rpc, toAccount, mint);

    const instructions: Instruction[] = [];

    // Create destination ATA if needed (from wallet address)
    if (!destIsInitialized) {
        instructions.push(
            getCreateAssociatedTokenIdempotentInstruction({
                payer: feePayerSigner,
                ata: destTokenAccount,
                owner: toAccount,
                mint,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            }),
        );
    }

    if (isFrozen && (enableSrfc37 ?? false)) {
        const thawInstructions = await getThawPermissionlessInstructions({
            authority: feePayerSigner,
            mint,
            tokenAccount: destTokenAccount,
            tokenAccountOwner: toAccount,
            rpc,
        });
        instructions.push(...thawInstructions);
    }

    // Add force transfer instruction using permanent delegate authority
    // The permanent delegate can transfer tokens without approval from the owner
    instructions.push(
        getTransferCheckedInstruction(
            {
                source: sourceTokenAccount,
                mint,
                destination: destTokenAccount,
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
export async function validatePermanentDelegate(
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    permanentDelegateAddress: Address,
): Promise<void> {
    const { extensions } = await getMintDetails(rpc, mint);

    // Check if permanent delegate extension exists
    const permanentDelegateExtension = extensions.find(
        (ext: { extension: string; state?: { delegate?: string } }) => ext.extension === 'permanentDelegate',
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
