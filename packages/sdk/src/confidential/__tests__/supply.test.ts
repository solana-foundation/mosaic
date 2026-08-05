import type { Address } from '@solana/kit';
import { ElGamalKeypair, AeKey } from '@solana/zk-sdk/node';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    UPDATE_CONFIDENTIAL_MINT_BURN_DECRYPTABLE_SUPPLY_DISCRIMINATOR,
    getUpdateConfidentialMintBurnDecryptableSupplyInstructionDataDecoder,
} from '@solana-program/token-2022';
import type { ConfidentialKeys } from '../keys';
import { decryptAesBalance, freeConfidentialKeys } from '../keys';
import { createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan } from '../supply';

// Uses the real @solana/zk-sdk WASM (verified to load under ts-jest ESM).
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Address;
const AUTHORITY = 'FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT' as Address;

/** Deterministic supply keys from fixed seeds (real WASM). */
function fixedSupplyKeys(): ConfidentialKeys {
    return {
        elgamal: ElGamalKeypair.fromSeed(new Uint8Array(32).fill(3)),
        aes: AeKey.fromSeed(new Uint8Array(32).fill(4)),
    };
}

describe('createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan', () => {
    let keys: ConfidentialKeys;

    beforeEach(() => {
        keys = fixedSupplyKeys();
    });

    afterEach(() => {
        freeConfidentialKeys(keys);
    });

    it('returns a single-instruction plan targeting Token-2022 with mint + authority', () => {
        const plan: any = createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
            mint: MINT,
            authority: AUTHORITY,
            supplyKeys: keys,
            supply: 1_000n,
        });

        expect(plan.kind).toBe('single');
        expect(plan.instruction.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);

        const accounts = plan.instruction.accounts.map((a: any) => a.address);
        expect(accounts[0]).toBe(MINT);
        expect(accounts[1]).toBe(AUTHORITY);
    });

    it('encodes the UpdateDecryptableSupply discriminator and a 36-byte decryptable supply', () => {
        const plan: any = createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
            mint: MINT,
            authority: AUTHORITY,
            supplyKeys: keys,
            supply: 1_000n,
        });

        const data = getUpdateConfidentialMintBurnDecryptableSupplyInstructionDataDecoder().decode(
            plan.instruction.data,
        );
        expect(data.discriminator).toBe(UPDATE_CONFIDENTIAL_MINT_BURN_DECRYPTABLE_SUPPLY_DISCRIMINATOR);
        expect(new Uint8Array(data.newDecryptableSupply).length).toBe(36);
    });

    it('rejects out-of-range (negative or > u64) supply values', () => {
        const call = (supply: bigint) =>
            createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
                mint: MINT,
                authority: AUTHORITY,
                supplyKeys: keys,
                supply,
            });

        expect(() => call(-1n)).toThrow('supply must be a u64');
        expect(() => call(2n ** 64n)).toThrow('supply must be a u64');
        // Boundary values are accepted.
        expect(() => call(0n)).not.toThrow();
        expect(() => call(2n ** 64n - 1n)).not.toThrow();
    });

    it('encodes the supply under the supply AES key (round-trips back to the amount)', () => {
        const plan: any = createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
            mint: MINT,
            authority: AUTHORITY,
            supplyKeys: keys,
            supply: 123_456n,
        });

        const data = getUpdateConfidentialMintBurnDecryptableSupplyInstructionDataDecoder().decode(
            plan.instruction.data,
        );
        expect(decryptAesBalance(keys.aes, new Uint8Array(data.newDecryptableSupply))).toBe(123_456n);
    });
});
