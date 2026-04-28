import { type Address, createAddressWithSeed, getAddressEncoder } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';

export type LockType = 'mint-lock' | 'burn-lock';

const SEED_PREFIX: Record<LockType, string> = {
    'mint-lock': 'mmf-ml',
    'burn-lock': 'mmf-bl',
};

/**
 * Computes a 32-byte UTF-8 seed string for the lock account.
 * Hash inputs: prefix bytes || mint address bytes || holder address bytes.
 * Output: hex of the first 16 bytes of SHA-256 (32 ASCII chars, the System program seed limit).
 */
export const computeLockSeed = async (lockType: LockType, mint: Address, holder: Address): Promise<string> => {
    const encoder = getAddressEncoder();
    const prefixBytes = new TextEncoder().encode(SEED_PREFIX[lockType]);
    const mintBytes = encoder.encode(mint);
    const holderBytes = encoder.encode(holder);

    const buf = new Uint8Array(prefixBytes.length + mintBytes.length + holderBytes.length);
    buf.set(prefixBytes, 0);
    buf.set(mintBytes, prefixBytes.length);
    buf.set(holderBytes, prefixBytes.length + mintBytes.length);

    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    let seed = '';
    for (let i = 0; i < 16; i++) {
        seed += digest[i].toString(16).padStart(2, '0');
    }
    return seed;
};

/**
 * Derives the deterministic lock account address for a given (permanentDelegate, mint, holder, lockType).
 * Address = sha256(permanentDelegate || seed || TOKEN_2022).
 */
export const deriveLockAccountAddress = async (input: {
    lockType: LockType;
    permanentDelegate: Address;
    mint: Address;
    holder: Address;
}): Promise<{ address: Address; seed: string }> => {
    const seed = await computeLockSeed(input.lockType, input.mint, input.holder);
    const address = await createAddressWithSeed({
        baseAddress: input.permanentDelegate,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        seed,
    });
    return { address, seed };
};
