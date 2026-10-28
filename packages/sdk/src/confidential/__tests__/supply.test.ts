import type { Address } from '@solana/kit';
import { getAddressDecoder } from '@solana/kit';
import { ElGamalKeypair, AeKey } from '@solana/zk-sdk/node';

// The builder now reads the mint to check `supplyKeys` against its registered
// supply pubkey, so the stubbed mint echoes back whichever keys the test built.
let mockSupplyElgamalPubkey: Address | null = null;
let mockMintExtensions: unknown[] = [];
jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    fetchMint: jest.fn(async () => ({ data: { extensions: { __option: 'Some', value: mockMintExtensions } } })),
}));

import {
    TOKEN_2022_PROGRAM_ADDRESS,
    UPDATE_CONFIDENTIAL_MINT_BURN_DECRYPTABLE_SUPPLY_DISCRIMINATOR,
    getUpdateConfidentialMintBurnDecryptableSupplyInstructionDataDecoder,
} from '@solana-program/token-2022';
import type { ConfidentialKeys } from '../keys.js';
import { decryptAesBalance, freeConfidentialKeys } from '../keys.js';
import { createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan } from '../supply.js';

const rpc = {} as never;

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
        const pubkey = keys.elgamal.pubkey();
        mockSupplyElgamalPubkey = getAddressDecoder().decode(pubkey.toBytes());
        pubkey.free?.();
        mockMintExtensions = [
            { __kind: 'ConfidentialMintBurn', supplyElgamalPubkey: mockSupplyElgamalPubkey },
            { __kind: 'ConfidentialTransferMint', auditorElgamalPubkey: { __option: 'None' } },
        ];
    });

    afterEach(() => {
        freeConfidentialKeys(keys);
    });

    it('returns a single-instruction plan targeting Token-2022 with mint + authority', async () => {
        const plan: any = await createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
            rpc,
            mint: MINT,
            authority: AUTHORITY,
            supplyKeys: keys,
            rawSupply: 1_000n,
        });

        expect(plan.kind).toBe('single');
        expect(plan.instruction.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);

        const accounts = plan.instruction.accounts.map((a: any) => a.address);
        expect(accounts[0]).toBe(MINT);
        expect(accounts[1]).toBe(AUTHORITY);
    });

    it('encodes the UpdateDecryptableSupply discriminator and a 36-byte decryptable supply', async () => {
        const plan: any = await createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
            rpc,
            mint: MINT,
            authority: AUTHORITY,
            supplyKeys: keys,
            rawSupply: 1_000n,
        });

        const data = getUpdateConfidentialMintBurnDecryptableSupplyInstructionDataDecoder().decode(
            plan.instruction.data,
        );
        expect(data.discriminator).toBe(UPDATE_CONFIDENTIAL_MINT_BURN_DECRYPTABLE_SUPPLY_DISCRIMINATOR);
        expect(new Uint8Array(data.newDecryptableSupply).length).toBe(36);
    });

    it('rejects out-of-range (negative or > u64) supply values', async () => {
        const call = (supply: bigint) =>
            createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
                rpc,
                mint: MINT,
                authority: AUTHORITY,
                supplyKeys: keys,
                rawSupply: supply,
            });

        await expect(call(-1n)).rejects.toThrow('rawSupply must be a u64');
        await expect(call(2n ** 64n)).rejects.toThrow('rawSupply must be a u64');
        // Boundary values are accepted.
        await expect(call(0n)).resolves.toBeDefined();
        await expect(call(2n ** 64n - 1n)).resolves.toBeDefined();
    });

    it("rejects supply keys that are not the mint's registered supply keys", async () => {
        // A different wallet's keys — e.g. an account holder's, an easy slip since
        // the neighbouring burn builder takes `keys`. The program would re-encrypt
        // under them regardless, breaking every later confidential mint.
        const otherKeys = { elgamal: ElGamalKeypair.fromSeed(new Uint8Array(32).fill(9)), aes: keys.aes };
        try {
            await expect(
                createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
                    rpc,
                    mint: MINT,
                    authority: AUTHORITY,
                    supplyKeys: otherKeys,
                    rawSupply: 1_000n,
                }),
            ).rejects.toThrow('does not match mint');
        } finally {
            otherKeys.elgamal.free?.();
        }
    });

    it('rejects a mint without the ConfidentialMintBurn extension', async () => {
        mockMintExtensions = [{ __kind: 'ConfidentialTransferMint', auditorElgamalPubkey: { __option: 'None' } }];

        await expect(
            createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
                rpc,
                mint: MINT,
                authority: AUTHORITY,
                supplyKeys: keys,
                rawSupply: 1_000n,
            }),
        ).rejects.toThrow('not configured for confidential mint/burn');
    });

    it('encodes the supply under the supply AES key (round-trips back to the amount)', async () => {
        const plan: any = await createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
            rpc,
            mint: MINT,
            authority: AUTHORITY,
            supplyKeys: keys,
            rawSupply: 123_456n,
        });

        const data = getUpdateConfidentialMintBurnDecryptableSupplyInstructionDataDecoder().decode(
            plan.instruction.data,
        );
        expect(decryptAesBalance(keys.aes, new Uint8Array(data.newDecryptableSupply))).toBe(123_456n);
    });
});
