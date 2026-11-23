import { createNoopSigner, generateKeyPairSigner } from '@solana/kit';
import { getSharedFeePayerSigner, resolveFeePayerAndAuthority, resolveSigners } from '../signers.js';

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

describe('resolveSigners', () => {
    it('resolves different addresses on their own', async () => {
        const [a, b] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
        const [resolvedA, resolvedB] = resolveSigners(a, b.address);
        expect(resolvedA).toBe(a);
        expect(resolvedB.address).toBe(b.address);
    });

    it('gives every role on one key the real signer, wherever it appears', async () => {
        const owner = await generateKeyPairSigner();
        const resolved = resolveSigners(owner.address, createNoopSigner(owner.address), owner);
        expect(resolved).toEqual([owner, owner, owner]);
        resolved.forEach(signer => expect(signer).toBe(owner));
    });

    it('keeps the first real signer when two real signers share a key', async () => {
        const first = await generateKeyPairSigner();
        const second = { ...first };
        const [a, b] = resolveSigners(first, second);
        expect(a).toBe(first);
        expect(b).toBe(first);
    });

    it('shares one no-op signer between bare addresses for one key', async () => {
        const { address } = await generateKeyPairSigner();
        const [a, b] = resolveSigners(address, address);
        expect(a).toBe(b);
        expect(a.address).toBe(address);
    });
});
