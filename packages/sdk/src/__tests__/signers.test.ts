import { createNoopSigner, generateKeyPairSigner } from '@solana/kit';
import { getSharedFeePayerSigner, resolveFeePayerAndAuthority } from '../signers.js';

describe('getSharedFeePayerSigner', () => {
    it('returns undefined when the addresses differ', async () => {
        const feePayer = await generateKeyPairSigner();
        const authority = await generateKeyPairSigner();
        expect(getSharedFeePayerSigner(feePayer, authority)).toBeUndefined();
    });

    it("uses the fee payer's signer for a bare-address authority", async () => {
        const feePayer = await generateKeyPairSigner();
        expect(getSharedFeePayerSigner(feePayer, feePayer.address)).toBe(feePayer);
    });

    it("uses the authority's signer for a bare-address fee payer", async () => {
        const authority = await generateKeyPairSigner();
        expect(getSharedFeePayerSigner(authority.address, authority)).toBe(authority);
    });

    it('prefers a real fee payer over a no-op authority', async () => {
        const feePayer = await generateKeyPairSigner();
        expect(getSharedFeePayerSigner(feePayer, createNoopSigner(feePayer.address))).toBe(feePayer);
    });

    // A no-op fee payer must not stand in for the authority: the key would then
    // carry no real signature.
    it('prefers a real authority over a no-op fee payer', async () => {
        const authority = await generateKeyPairSigner();
        expect(getSharedFeePayerSigner(createNoopSigner(authority.address), authority)).toBe(authority);
    });

    it('keeps the fee payer when both are no-op signers', async () => {
        const { address } = await generateKeyPairSigner();
        const feePayer = createNoopSigner(address);
        expect(getSharedFeePayerSigner(feePayer, createNoopSigner(address))).toBe(feePayer);
    });
});

describe('resolveFeePayerAndAuthority', () => {
    it('gives both roles the real signer when the fee payer is a no-op for the same key', async () => {
        const authority = await generateKeyPairSigner();
        const { feePayerSigner, authoritySigner } = resolveFeePayerAndAuthority(
            createNoopSigner(authority.address),
            authority,
        );
        expect(feePayerSigner).toBe(authority);
        expect(authoritySigner).toBe(authority);
    });
});
