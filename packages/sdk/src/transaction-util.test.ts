import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import {
    createMockRpc,
    resetMockRpc,
    seedAccountOwner,
    seedMintDetails,
    TEST_AUTHORITY,
} from './__tests__/test-utils.js';
import { TOKEN_ACL_PROGRAM_ID } from './token-acl/utils.js';
import { decimalAmountToRaw, getMintDetails, validateDecimalAmount } from './transaction-util.js';

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
    });

    it.each(['0', '0.0', '.0', '0.000', 0, -0])('rejects the zero amount %p', amount => {
        expect(() => decimalAmountToRaw(amount, 6)).toThrow('Amount must be a positive number');
    });

    it('expands number amounts in exponent notation without rounding', () => {
        expect(decimalAmountToRaw(1e-7, 9)).toBe(100n);
        expect(decimalAmountToRaw(1.5e-7, 9)).toBe(150n);
        expect(decimalAmountToRaw(1e-21, 21)).toBe(1n);
        expect(decimalAmountToRaw(1.23456789012345e-15, 29)).toBe(123_456_789_012_345n);
    });

    it('rejects number amounts below the mint precision instead of rounding them to zero', () => {
        expect(() => decimalAmountToRaw(1e-21, 9)).toThrow('Amount cannot have more than 9 decimal places');
        expect(() => decimalAmountToRaw(1.23456789012345e-15, 20)).toThrow(
            'Amount cannot have more than 20 decimal places',
        );
    });

    it('keeps the u64 and sign checks for number amounts in exponent notation', () => {
        expect(() => decimalAmountToRaw(1e21, 0)).toThrow('Amount exceeds the maximum u64 token amount');
        expect(() => decimalAmountToRaw(-1e-7, 9)).toThrow('Amount must be a positive number');
    });

    it.each([NaN, Infinity])('rejects the non-finite number %p', amount => {
        expect(() => decimalAmountToRaw(amount, 6)).toThrow('Invalid amount format');
    });

    it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
        expect(decimalAmountToRaw('18446744073709.551615', 6)).toBe(18_446_744_073_709_551_615n);
    });

    it('rejects fractional digits beyond the mint decimals instead of truncating them', () => {
        expect(() => decimalAmountToRaw('1.23456789', 6)).toThrow('Amount cannot have more than 6 decimal places');
        expect(() => decimalAmountToRaw('1.5', 0)).toThrow('Amount cannot have more than 0 decimal places');
    });

    it('ignores trailing zeros, which do not change the value', () => {
        expect(decimalAmountToRaw('5.0', 0)).toBe(5n);
        expect(decimalAmountToRaw('1.5000000', 6)).toBe(1_500_000n);
        expect(decimalAmountToRaw('1.2345670', 6)).toBe(1_234_567n);
        // A significant digit past the limit still throws, even with a trailing zero.
        expect(() => decimalAmountToRaw('1.23456780', 6)).toThrow('Amount cannot have more than 6 decimal places');
    });

    it('rejects malformed amounts instead of silently reinterpreting them', () => {
        // '1.5.5' used to parse as '1.5': split('.') discarded the extra part.
        expect(() => decimalAmountToRaw('1.5.5', 6)).toThrow('Invalid amount format');
        // '' and '.' used to yield 0n.
        expect(() => decimalAmountToRaw('', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('.', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('1e3', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('+1.5', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw(' 1.5', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('1_000', 6)).toThrow('Invalid amount format');
    });

    it('still rejects negatives and out-of-range decimals', () => {
        expect(() => decimalAmountToRaw('-1', 6)).toThrow('Amount must be a positive number');
        expect(() => decimalAmountToRaw('1', 256)).toThrow('Decimals must be an integer between 0 and 255');
    });
});

describe('validateDecimalAmount', () => {
    it.each(['1', '1.', '.5', '0.000001', '9007199254740993'])('accepts %p', amount => {
        expect(() => validateDecimalAmount(amount)).not.toThrow();
    });

    it.each(['0', '0.0', '.', '', '-1', '1e3', '+1', '1.2.3'])('rejects %p with the shared message', amount => {
        expect(() => validateDecimalAmount(amount)).toThrow('Amount must be a positive number');
    });

    it('rejects a long run of digits in linear time', () => {
        // `\d+\.?\d*` took seconds here: it tries every split of the digit run.
        const amount = '1'.repeat(100_000) + 'x';
        const start = Date.now();
        expect(() => validateDecimalAmount(amount)).toThrow('Amount must be a positive number');
        expect(() => decimalAmountToRaw(amount, 6)).toThrow('Invalid amount format');
        expect(Date.now() - start).toBeLessThan(1000);
    });
});
