import type { Address, Commitment, Rpc, SolanaRpcApi, TransactionSigner, Instruction } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    createNoopSigner,
    fetchEncodedAccount,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
} from '@solana/kit';
import {
    decodeMint,
    getPermissionedBurnCheckedInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import {
    resolveTokenAccount,
    decimalAmountToRaw,
    getMintDetails,
    isDefaultAccountStateSetFrozen,
} from '../transaction-util';
import { getThawPermissionlessInstructions } from '../token-acl';

/**
 * Returns the permissioned burn authority configured on a mint, or null if the
 * mint account does not exist, does not have the permissioned burn extension, or
 * its authority was cleared (which re-enables regular burns).
 *
 * Decodes the mint account directly instead of relying on jsonParsed RPC output,
 * which may not recognize the extension on older RPC node versions.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param commitment - Commitment level for the RPC call (defaults to 'confirmed')
 * @returns The configured burn authority address, or null
 */
export async function getPermissionedBurnAuthority(
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    commitment: Commitment = 'confirmed',
): Promise<Address | null> {
    const encodedAccount = await fetchEncodedAccount(rpc, mint, { commitment });
    if (!encodedAccount.exists) {
        return null;
    }
    const decodedMint = decodeMint(encodedAccount);
    if (decodedMint.data.extensions?.__option !== 'Some') {
        return null;
    }
    const permissionedBurnExtension = decodedMint.data.extensions.value.find(ext => ext.__kind === 'PermissionedBurn');
    if (!permissionedBurnExtension || permissionedBurnExtension.__kind !== 'PermissionedBurn') {
        return null;
    }
    return permissionedBurnExtension.authority?.__option === 'Some' ? permissionedBurnExtension.authority.value : null;
}

/**
 * Creates a transaction to burn tokens from an account on a mint with the
 * permissioned burn extension. Burning requires both the account owner (or delegate)
 * and the configured burn authority to sign.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param fromAccount - The account to burn from (wallet or ATA)
 * @param decimalAmount - The decimal amount to burn (e.g., 1.5)
 * @param permissionedBurnAuthority - The burn authority signer configured on the mint
 * @param feePayer - The fee payer signer
 * @param owner - The token account owner/delegate (defaults to fromAccount)
 * @returns A promise that resolves to a FullTransaction object for burning tokens
 */
export const createPermissionedBurnTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    fromAccount: Address,
    decimalAmount: number,
    permissionedBurnAuthority: Address | TransactionSigner<string>,
    feePayer: Address | TransactionSigner<string>,
    owner?: Address | TransactionSigner<string>,
): Promise<FullTransaction> => {
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
    const permissionedBurnAuthoritySigner =
        typeof permissionedBurnAuthority === 'string'
            ? createNoopSigner(permissionedBurnAuthority)
            : permissionedBurnAuthority;
    const ownerSigner = owner ? (typeof owner === 'string' ? createNoopSigner(owner) : owner) : undefined;

    const { decimals, extensions, usesTokenAcl } = await getMintDetails(rpc, mint);
    const enableSrfc37 = usesTokenAcl && isDefaultAccountStateSetFrozen(extensions);

    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

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

    instructions.push(
        getPermissionedBurnCheckedInstruction(
            {
                account: sourceTokenAccount,
                mint,
                permissionedBurnAuthority: permissionedBurnAuthoritySigner,
                authority: ownerSigner ?? createNoopSigner(fromAccount),
                amount: rawAmount,
                decimals,
            },
            {
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            },
        ),
    );

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayerSigner, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

/**
 * Validates that a mint has the permissioned burn extension enabled
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param expectedAuthority - Optional expected burn authority address
 * @returns Promise that resolves if validation passes, throws if not
 */
export async function validatePermissionedBurnForMint(
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    expectedAuthority?: Address,
): Promise<void> {
    const configuredAuthority = await getPermissionedBurnAuthority(rpc, mint);

    if (!configuredAuthority) {
        throw new Error(`Mint ${mint} does not have permissioned burn extension enabled`);
    }

    if (expectedAuthority && configuredAuthority !== expectedAuthority) {
        throw new Error(
            `Permissioned burn authority mismatch. Expected: ${expectedAuthority}, Found: ${configuredAuthority}`,
        );
    }
}
