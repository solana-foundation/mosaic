import type { KeyPairSigner, Rpc, SolanaRpcApi } from '@solana/kit';
import {
    assertIsFullySignedTransaction,
    generateKeyPairSigner,
    getSignersFromTransactionMessage,
    isTransactionSigner,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    getUpdateMultiplierScaledUiMintInstructionDataDecoder,
} from '@solana-program/token-2022';
import { createMockRpc } from '../../__tests__/test-utils.js';
import { createUpdateScaledUiMultiplierTransaction } from '../scaled-ui-amount.js';

describe('createUpdateScaledUiMultiplierTransaction', () => {
    let rpc: Rpc<SolanaRpcApi>;
    let authority: KeyPairSigner;
    let feePayer: KeyPairSigner;
    let mint: KeyPairSigner;

    beforeAll(async () => {
        authority = await generateKeyPairSigner();
        feePayer = await generateKeyPairSigner();
        mint = await generateKeyPairSigner();
    });

    beforeEach(() => {
        rpc = createMockRpc();
    });

    const build = (overrides: Partial<Parameters<typeof createUpdateScaledUiMultiplierTransaction>[1]> = {}) =>
        createUpdateScaledUiMultiplierTransaction(rpc, {
            mint: mint.address,
            authority,
            multiplier: 1.5,
            feePayer,
            ...overrides,
        });

    test('builds one UpdateMultiplierScaledUiMint instruction, effective now by default', async () => {
        const tx = await build();

        expect(tx.instructions).toHaveLength(1);
        const [ix] = tx.instructions;
        expect(ix.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(ix.accounts?.[0]?.address).toBe(mint.address);
        const data = getUpdateMultiplierScaledUiMintInstructionDataDecoder().decode(ix.data!);
        expect(data.multiplier).toBe(1.5);
        expect(data.effectiveTimestamp).toBe(0n);
    });

    test('passes a scheduled effective timestamp through', async () => {
        const tx = await build({ multiplier: 7, effectiveTimestamp: 1_900_000_000 });

        const data = getUpdateMultiplierScaledUiMintInstructionDataDecoder().decode(tx.instructions[0].data!);
        expect(data.multiplier).toBe(7);
        expect(data.effectiveTimestamp).toBe(1_900_000_000n);
    });

    test('attaches the authority and fee payer as signers', async () => {
        const tx = await build();

        expect(isTransactionSigner(tx.feePayer)).toBe(true);
        expect(tx.feePayer.address).toBe(feePayer.address);
        const authorityMeta = tx.instructions[0].accounts?.[1] as { address: string; signer?: unknown };
        expect(authorityMeta.address).toBe(authority.address);
        expect(authorityMeta.signer).toBe(authority);
        expect(getSignersFromTransactionMessage(tx)).toEqual(expect.arrayContaining([authority, feePayer]));
    });

    // Regression for HOO-955: the app used to set a plain fee-payer address and authority, so
    // signing with the attached signers threw SIGNATURES_MISSING.
    test('signs fully with the attached signers', async () => {
        const tx = await build();

        const signed = await signTransactionMessageWithSigners(tx);
        expect(() => assertIsFullySignedTransaction(signed)).not.toThrow();
        expect(Object.keys(signed.signatures).sort()).toEqual([authority.address, feePayer.address].sort());
    });

    test('a single wallet acting as authority and fee payer signs once', async () => {
        const tx = await build({ feePayer: authority });

        const signed = await signTransactionMessageWithSigners(tx);
        expect(() => assertIsFullySignedTransaction(signed)).not.toThrow();
        expect(Object.keys(signed.signatures)).toEqual([authority.address]);
    });

    test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects multiplier %p', async multiplier => {
        await expect(build({ multiplier })).rejects.toThrow('Multiplier must be a finite number greater than 0');
    });

    test.each([-1, 1.5, -1n, Number.NaN])('rejects effective timestamp %p', async effectiveTimestamp => {
        await expect(build({ effectiveTimestamp })).rejects.toThrow(
            'Effective timestamp must be a whole number of seconds, 0 or greater',
        );
    });
});
