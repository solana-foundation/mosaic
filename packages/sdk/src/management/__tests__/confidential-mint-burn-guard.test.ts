import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { createMockRpc, createMockSigner, resetMockRpc, seedMintDetails } from '../../__tests__/test-utils';

// A ConfidentialMintBurn mint tracks its supply as an encrypted value, so the
// Token-2022 program rejects plaintext MintTo / Burn. These tests assert the SDK
// guard fails fast (with an actionable message) instead of building a transaction
// the chain would reject. `isConfidentialMintBurnMint` reads the mint via
// `fetchMint`, so we mock it to flip the extension on and off.
let mockMintExtensions: unknown[] = [];
jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    fetchMint: jest.fn(async () => ({
        data: { decimals: 6, extensions: { __option: 'Some', value: mockMintExtensions } },
    })),
}));

const MINT_BURN_EXT = {
    __kind: 'ConfidentialMintBurn',
    confidentialSupply: new Uint8Array(64),
    decryptableSupply: new Uint8Array(36),
    supplyElgamalPubkey: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as Address,
    pendingBurn: new Uint8Array(64),
};
const TRANSFER_MINT_EXT = { __kind: 'ConfidentialTransferMint', auditorElgamalPubkey: { __option: 'None' } };

const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Address;
const wallet = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;

describe('confidential mint/burn guard on plaintext mint & burn', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const authority = createMockSigner('MintAuth77777777777777777777777777777777777');
    const feePayer = createMockSigner('Fee777777777777777777777777777777777777');

    beforeEach(() => {
        rpc = createMockRpc();
        resetMockRpc(rpc);
        mockMintExtensions = [];
        // getMintDetails (jsonParsed) must resolve so the guard — not a missing
        // mint — is what rejects.
        seedMintDetails(rpc, { address: mint, decimals: 6, mintAuthority: wallet });
    });

    test('createMintToTransaction rejects when the mint has ConfidentialMintBurn', async () => {
        mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
        const { createMintToTransaction } = await import('../mint');
        await expect(createMintToTransaction(rpc, mint, wallet, 1, authority, feePayer)).rejects.toThrow(
            /ConfidentialMintBurn extension enabled; plaintext minting is not supported/,
        );
    });

    test('createBurnTransaction rejects when the mint has ConfidentialMintBurn', async () => {
        mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
        const { createBurnTransaction } = await import('../burn');
        await expect(createBurnTransaction(rpc, mint, wallet, 1, feePayer)).rejects.toThrow(
            /ConfidentialMintBurn extension enabled; plaintext burning is not supported/,
        );
    });

    test('createForceBurnTransaction rejects when the mint has ConfidentialMintBurn', async () => {
        mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
        const { createForceBurnTransaction } = await import('../force-burn');
        await expect(createForceBurnTransaction(rpc, mint, wallet, 1, authority, feePayer)).rejects.toThrow(
            /ConfidentialMintBurn extension enabled; plaintext burning is not supported/,
        );
    });

    describe('isConfidentialMintBurnMint', () => {
        test('is true when the extension is present', async () => {
            mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
            const { isConfidentialMintBurnMint } = await import('../../transaction-util');
            await expect(isConfidentialMintBurnMint(rpc, mint)).resolves.toBe(true);
        });

        test('is false for a confidential-balances-only mint (ConfidentialTransferMint alone)', async () => {
            mockMintExtensions = [TRANSFER_MINT_EXT];
            const { isConfidentialMintBurnMint } = await import('../../transaction-util');
            await expect(isConfidentialMintBurnMint(rpc, mint)).resolves.toBe(false);
        });

        test('is false when the mint has no extensions', async () => {
            mockMintExtensions = [];
            const { isConfidentialMintBurnMint } = await import('../../transaction-util');
            await expect(isConfidentialMintBurnMint(rpc, mint)).resolves.toBe(false);
        });
    });
});
