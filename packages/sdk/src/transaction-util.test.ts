import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import {
    createMockRpc,
    resetMockRpc,
    seedAccountOwner,
    seedMintDetails,
    TEST_AUTHORITY,
} from './__tests__/test-utils.js';
import { TOKEN_ACL_PROGRAM_ID } from './token-acl/utils.js';
import { decimalAmountToRaw, getMintDetails } from './transaction-util.js';

describe('getMintDetails', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const mint = 'Mint777777777777777777777777777777777777777' as Address;
    const signerFreezeAuthority = TEST_AUTHORITY;

    beforeEach(() => {
        rpc = createMockRpc();
        resetMockRpc(rpc);
    });

    test('does not throw when a signer freeze authority has no on-chain account', async () => {
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            freezeAuthority: signerFreezeAuthority,
            mintAuthority: signerFreezeAuthority,
        });

        await expect(getMintDetails(rpc, mint)).resolves.toMatchObject({
            decimals: 6,
            freezeAuthority: signerFreezeAuthority,
            mintAuthority: signerFreezeAuthority,
            usesTokenAcl: false,
        });
    });

    test('marks usesTokenAcl when the freeze authority account is owned by the Token ACL program', async () => {
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            freezeAuthority: signerFreezeAuthority,
        });
        seedAccountOwner(rpc, signerFreezeAuthority, TOKEN_ACL_PROGRAM_ID);

        await expect(getMintDetails(rpc, mint)).resolves.toMatchObject({
            freezeAuthority: signerFreezeAuthority,
            usesTokenAcl: true,
        });
    });
});

describe('decimalAmountToRaw', () => {
    it('scales valid decimal strings', () => {
        expect(decimalAmountToRaw('1.5', 6)).toBe(1_500_000n);
        expect(decimalAmountToRaw('1', 6)).toBe(1_000_000n);
        expect(decimalAmountToRaw('0.000001', 6)).toBe(1n);
        expect(decimalAmountToRaw('.5', 6)).toBe(500_000n);
        expect(decimalAmountToRaw('1.', 6)).toBe(1_000_000n);
        expect(decimalAmountToRaw('0', 6)).toBe(0n);
    });

    it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
        expect(decimalAmountToRaw('18446744073709.551615', 6)).toBe(18_446_744_073_709_551_615n);
    });

    it('truncates fractional digits beyond the mint decimals', () => {
        expect(decimalAmountToRaw('1.23456789', 6)).toBe(1_234_567n);
    });

    it('rejects malformed amounts instead of silently truncating them', () => {
        // '1.5.5' used to parse as '1.5': split('.') discarded the extra part.
        expect(() => decimalAmountToRaw('1.5.5', 6)).toThrow('Invalid amount format');
        // '' used to yield 0n.
        expect(() => decimalAmountToRaw('', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('.', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('1e3', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('+1.5', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw(' 1.5', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('1_000', 6)).toThrow('Invalid amount format');
    });

    it('still rejects negatives and out-of-range decimals', () => {
        expect(() => decimalAmountToRaw('-1', 6)).toThrow('Amount must be positive');
        expect(() => decimalAmountToRaw('1', 10)).toThrow('Decimals must be between 0 and 9');
    });
});
