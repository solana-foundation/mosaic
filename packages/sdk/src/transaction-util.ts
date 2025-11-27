import type {
    FullTransaction,
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionMessageWithBlockhashLifetime,
    Rpc,
    Address,
    SolanaRpcApi,
} from 'gill';
import {
    getBase58Decoder,
    compileTransaction,
    address,
    getTransactionCodec,
    getBase64EncodedWireTransaction,
} from 'gill';
import { getAssociatedTokenAccountAddress, TOKEN_2022_PROGRAM_ADDRESS, SYSTEM_PROGRAM_ADDRESS } from 'gill/programs';
import { TOKEN_ACL_PROGRAM_ID } from './token-acl/utils';

/**
 * Converts a compiled Solana transaction to a base58-encoded string.
 *
 * Note: Squads still requires base58 encoded transactions.
 *
 * @param transaction - The full transaction object to encode.
 * @returns The base58-encoded transaction as a string.
 */
export const transactionToB58 = (
    transaction: FullTransaction<
        TransactionVersion,
        TransactionMessageWithFeePayer,
        TransactionMessageWithBlockhashLifetime
    >,
): string => {
    const compiledTransaction = compileTransaction(transaction);
    const transactionBytes = getTransactionCodec().encode(compiledTransaction);
    return getBase58Decoder().decode(transactionBytes);
};

/**
 * Converts a compiled Solana transaction to a base64-encoded string.
 *
 * Base64 encoded transactions are recommended for most use cases.
 *
 * @param transaction - The full transaction object to encode.
 * @returns The base64-encoded transaction as a string.
 */
export const transactionToB64 = (
    transaction: FullTransaction<
        TransactionVersion,
        TransactionMessageWithFeePayer,
        TransactionMessageWithBlockhashLifetime
    >,
): string => {
    const compiledTransaction = compileTransaction(transaction);
    return getBase64EncodedWireTransaction(compiledTransaction);
};

/**
 * Converts a decimal amount to raw token amount based on mint decimals
 *
 * @param decimalAmount - The decimal amount (e.g., 1.5)
 * @param decimals - The number of decimals the token has
 * @returns The raw token amount as bigint
 */
export function decimalAmountToRaw(decimalAmount: number, decimals: number): bigint {
    if (decimals < 0 || decimals > 9) {
        throw new Error('Decimals must be between 0 and 9');
    }

    // Convert to string to avoid floating-point precision issues
    const amountStr = decimalAmount.toString();

    // Reject negative amounts
    if (amountStr.startsWith('-')) {
        throw new Error('Amount must be positive');
    }

    // Split into integer and fractional parts
    const [integerPart, fractionalPart = ''] = amountStr.split('.');

    // Pad or truncate fractional part to match decimals
    let adjustedFractional: string;
    if (fractionalPart.length > decimals) {
        // Truncate if fractional part is longer than decimals
        adjustedFractional = fractionalPart.slice(0, decimals);
    } else {
        // Pad with zeros if fractional part is shorter than decimals
        adjustedFractional = fractionalPart.padEnd(decimals, '0');
    }

    // Concatenate integer and fractional parts
    const rawAmountStr = integerPart + adjustedFractional;

    // Validate that the resulting string is a valid numeric representation
    if (!/^\d+$/.test(rawAmountStr)) {
        throw new Error('Invalid amount format');
    }

    // Convert to BigInt
    return BigInt(rawAmountStr);
}

/**
 * Determines if an address is an Associated Token Account or wallet address
 * Returns the token account address to use for any operation
 * Note this function will not ensure that the account exists onchain
 *
 * @param rpc - The Solana RPC client instance
 * @param account - The account address (could be wallet or ATA)
 * @param mint - The mint address
 * @returns Promise with the token account address and whether it was derived
 */
export async function resolveTokenAccount(
    rpc: Rpc<SolanaRpcApi>,
    account: Address,
    mint: Address,
): Promise<{
    tokenAccount: Address;
    isInitialized: boolean;
    isFrozen: boolean;
}> {
    const accountInfo = await rpc.getAccountInfo(account, { encoding: 'jsonParsed' }).send();

    // Check if it's an existing token account for this mint
    if (accountInfo.value?.owner === TOKEN_2022_PROGRAM_ADDRESS) {
        const data = accountInfo.value?.data;
        if ('parsed' in data && data.parsed?.info) {
            const ataInfo = data.parsed.info as { mint: Address; state: string };
            if (ataInfo.mint === mint) {
                return {
                    tokenAccount: account,
                    isInitialized: true,
                    isFrozen: ataInfo.state === 'frozen',
                };
            }
            throw new Error(`Token account ${account} is not for mint ${mint} but for ${ataInfo.mint}`);
        }
        throw new Error(`Unable to parse token account data for ${account}`);
    }

    // If account exists but not a valid token program account
    if (accountInfo.value && accountInfo.value.owner !== SYSTEM_PROGRAM_ADDRESS) {
        throw new Error(`Token account ${account} is not a valid account for mint ${mint}`);
    }

    // Derive ATA for wallet address
    const ata = await getAssociatedTokenAccountAddress(mint, account, TOKEN_2022_PROGRAM_ADDRESS);
    // check if the ATA is frozen
    const ataInfo = await rpc.getAccountInfo(ata, { encoding: 'jsonParsed' }).send();
    if (ataInfo.value?.data && 'parsed' in ataInfo.value.data && ataInfo.value.data.parsed?.info) {
        const tokenState = (ataInfo.value?.data.parsed?.info as { state: string }).state;
        return {
            tokenAccount: ata,
            isInitialized: true,
            isFrozen: tokenState === 'frozen',
        };
    }

    // if the ATA doesn't exist yet, consider it frozen as it will be created through Token ACL
    return { tokenAccount: ata, isInitialized: false, isFrozen: true };
}

/**
 * Gets mint information including decimals
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @returns Promise with mint information including decimals
 */
export async function getMintDetails(rpc: Rpc<SolanaRpcApi>, mint: Address) {
    const accountInfo = await rpc.getAccountInfo(mint, { encoding: 'jsonParsed' }).send();

    if (!accountInfo.value) {
        throw new Error(`Mint account ${mint} not found`);
    }

    const data = accountInfo.value.data;
    if (!('parsed' in data) || !data.parsed?.info) {
        throw new Error(`Unable to parse mint data for ${mint}`);
    }

    const mintInfo = data.parsed.info as {
        decimals: number;
        freezeAuthority?: string;
        mintAuthority?: string;
        extensions?: Array<{ extension: string; state?: Record<string, unknown> }>;
    };

    let usesTokenAcl = false;

    if (mintInfo.freezeAuthority) {
        const freezeAuthorityAccountInfo = await rpc.getAccountInfo(address(mintInfo.freezeAuthority)).send();
        if (!freezeAuthorityAccountInfo.value) {
            throw new Error(`Freeze authority account ${mintInfo.freezeAuthority} not found`);
        }
        usesTokenAcl = freezeAuthorityAccountInfo.value?.owner === TOKEN_ACL_PROGRAM_ID;
    }

    return {
        decimals: mintInfo.decimals,
        freezeAuthority: mintInfo.freezeAuthority,
        mintAuthority: mintInfo.mintAuthority,
        extensions: mintInfo.extensions || [],
        usesTokenAcl,
    };
}

/**
 * Checks if the default account state is set to frozen
 *
 * @param extensions - The extensions of the mint
 * @returns True if the default account state is set to frozen, false otherwise
 */
export function isDefaultAccountStateSetFrozen(
    extensions: Array<{ extension: string; state?: Record<string, unknown> }>,
): boolean {
    return extensions.some(ext => ext.extension === 'defaultAccountState' && ext.state?.accountState === 'frozen');
}

/**
 * Gets the decimals of a mint
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @returns Promise with the decimals of the mint
 */
export async function getMintDecimals(rpc: Rpc<SolanaRpcApi>, mint: Address): Promise<number> {
    const accountInfo = await rpc.getAccountInfo(mint, { encoding: 'jsonParsed' }).send();

    if (!accountInfo.value) {
        throw new Error(`Mint account ${mint} not found`);
    }

    const data = accountInfo.value.data;
    if (!('parsed' in data) || !data.parsed?.info) {
        throw new Error(`Unable to parse mint data for ${mint}`);
    }

    const mintInfo = data.parsed.info as {
        decimals: number;
    };

    return mintInfo.decimals;
}
