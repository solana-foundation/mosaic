import type { Address, Rpc, SolanaRpcApi, TransactionSigner, Instruction } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    createNoopSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
} from '@solana/kit';
import {
    getBurnCheckedInstruction,
    getPermissionedBurnCheckedInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import {
    resolveTokenAccount,
    decimalAmountToRaw,
    getMintDetails,
    isConfidentialMintBurnMint,
    isDefaultAccountStateSetFrozen,
} from '../transaction-util';
import { getThawPermissionlessInstructions } from '../token-acl';
import { getPermissionedBurnAuthority } from './permissioned-burn';

/**
 * Creates a transaction to force burn tokens using the permanent delegate extension.
 * This allows the permanent delegate to burn tokens from any account regardless of approval.
 *
 * If the mint has the permissioned burn extension, the configured burn authority must
 * co-sign. When the burn authority matches the permanent delegate (the template default),
 * the delegate signer covers both roles; otherwise pass permissionedBurnAuthority.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param fromAccount - The account address to burn tokens from (wallet or ATA)
 * @param decimalAmount - The decimal amount to burn (e.g., 1.5)
 * @param permanentDelegate - The permanent delegate authority signer
 * @param feePayer - The fee payer signer
 * @param permissionedBurnAuthority - Burn authority signer for permissioned burn mints
 * @returns A promise that resolves to a FullTransaction object for force burning tokens
 */
export const createForceBurnTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    fromAccount: Address,
    decimalAmount: number,
    permanentDelegate: Address | TransactionSigner<string>,
    feePayer: Address | TransactionSigner<string>,
    permissionedBurnAuthority?: Address | TransactionSigner<string>,
): Promise<FullTransaction> => {
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
    const permanentDelegateSigner =
        typeof permanentDelegate === 'string' ? createNoopSigner(permanentDelegate) : permanentDelegate;

    // A ConfidentialMintBurn mint keeps its supply encrypted, so Token-2022 rejects
    // plaintext Burn — including a permanent-delegate force burn (IllegalMintBurnConversion).
    // Fail fast with an actionable message rather than building a transaction the chain
    // would reject.
    if (await isConfidentialMintBurnMint(rpc, mint)) {
        throw new Error(
            `Mint ${mint} has the ConfidentialMintBurn extension enabled; plaintext burning is not supported. ` +
                `Use the confidential burn path (createConfidentialBurnInstructionPlan) from ` +
                `@solana/mosaic-sdk/confidential instead.`,
        );
    }

    // Get mint info to determine decimals
    const { decimals, extensions, usesTokenAcl } = await getMintDetails(rpc, mint);
    const enableSrfc37 = usesTokenAcl && isDefaultAccountStateSetFrozen(extensions);

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
    // The permanent delegate can burn tokens without approval from the owner.
    // Permissioned burn mints reject regular burns, so the burn authority co-signs there.
    const configuredBurnAuthority = await getPermissionedBurnAuthority(rpc, mint);
    if (configuredBurnAuthority) {
        const permissionedBurnAuthoritySigner = permissionedBurnAuthority
            ? typeof permissionedBurnAuthority === 'string'
                ? createNoopSigner(permissionedBurnAuthority)
                : permissionedBurnAuthority
            : configuredBurnAuthority === permanentDelegateSigner.address
              ? permanentDelegateSigner
              : createNoopSigner(configuredBurnAuthority);
        instructions.push(
            getPermissionedBurnCheckedInstruction(
                {
                    account: sourceTokenAccount,
                    mint,
                    permissionedBurnAuthority: permissionedBurnAuthoritySigner,
                    authority: permanentDelegateSigner,
                    amount: rawAmount,
                    decimals,
                },
                {
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                },
            ),
        );
    } else {
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
    }

    // Get latest blockhash for transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayerSigner, m),
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
