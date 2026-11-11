import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { createMockRpc, createMockSigner, resetMockRpc, seedMintDetails } from '../../__tests__/test-utils.js';

// A ConfidentialMintBurn mint tracks its supply as an encrypted value, so the
// Token-2022 program rejects plaintext MintTo / Burn. These tests assert the SDK
// guard fails fast (with an actionable message) instead of building a transaction
// the chain would reject. The builders detect the extension from the mint they
// already fetch via `getMintDetails` (jsonParsed), so the guard tests seed the
// `confidentialMintBurn` extension there. The standalone `isConfidentialMintBurnMint`
// reads the mint via `fetchMint` (Codama), so its own tests flip `mockMintExtensions`.
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

// jsonParsed extension entry (as returned by getMintDetails) for a mint that has
// the ConfidentialMintBurn extension — this is what the builders' guard reads.
const CONFIDENTIAL_MINT_BURN_JSON_EXT = { extension: 'confidentialMintBurn' };

// What an RPC node emits for ANY extension it is too old to recognize — including
// PermissionedBurn / PausableConfig / ScaledUiAmountConfig, which Mosaic's own
// templates enable. Ambiguous on its own, so the guard resolves it by decoding the
// mint (mockMintExtensions below) rather than assuming a match.
const UNPARSEABLE_JSON_EXT = { extension: 'unparseableExtension' };

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
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            mintAuthority: wallet,
            extensions: [CONFIDENTIAL_MINT_BURN_JSON_EXT],
        });
        const { createMintToTransaction } = await import('../mint.js');
        await expect(createMintToTransaction(rpc, mint, wallet, 1, authority, feePayer)).rejects.toThrow(
            /ConfidentialMintBurn extension enabled; plaintext minting is not supported/,
        );
    });

    test('createBurnTransaction rejects when the mint has ConfidentialMintBurn', async () => {
        mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            mintAuthority: wallet,
            extensions: [CONFIDENTIAL_MINT_BURN_JSON_EXT],
        });
        const { createBurnTransaction } = await import('../burn.js');
        await expect(createBurnTransaction(rpc, mint, wallet, 1, feePayer)).rejects.toThrow(
            /ConfidentialMintBurn extension enabled; plaintext burning is not supported/,
        );
    });

    test('createForceBurnTransaction rejects when the mint has ConfidentialMintBurn', async () => {
        mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            mintAuthority: wallet,
            extensions: [CONFIDENTIAL_MINT_BURN_JSON_EXT],
        });
        const { createForceBurnTransaction } = await import('../force-burn.js');
        await expect(createForceBurnTransaction(rpc, mint, wallet, 1, authority, feePayer)).rejects.toThrow(
            /ConfidentialMintBurn extension enabled; plaintext burning is not supported/,
        );
    });

    test('createForceBurnTransaction does not point the permanent delegate at the confidential burn builder', async () => {
        // A confidential burn needs the token account owner's ElGamal/AES keys, which
        // a permanent delegate doesn't hold — so the message must say the operation is
        // unsupported rather than advertising a builder the delegate can't call.
        mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            mintAuthority: wallet,
            extensions: [CONFIDENTIAL_MINT_BURN_JSON_EXT],
        });
        const { createForceBurnTransaction } = await import('../force-burn.js');
        const error = await createForceBurnTransaction(rpc, mint, wallet, 1, authority, feePayer).then(
            () => null,
            (e: Error) => e,
        );
        expect(error?.message).toMatch(/permanent-delegate force burn has no confidential equivalent/);
        expect(error?.message).not.toMatch(/Use the confidential path/);
    });

    test('createPermissionedBurnTransaction rejects when the mint has ConfidentialMintBurn', async () => {
        mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            mintAuthority: wallet,
            extensions: [CONFIDENTIAL_MINT_BURN_JSON_EXT],
        });
        const { createPermissionedBurnTransaction } = await import('../permissioned-burn.js');
        await expect(createPermissionedBurnTransaction(rpc, mint, wallet, 1, authority, feePayer)).rejects.toThrow(
            /ConfidentialMintBurn extension enabled; plaintext burning is not supported/,
        );
    });

    describe('mintHasConfidentialMintBurnExtension', () => {
        test('is true on the parsed extension, without decoding the mint', async () => {
            mockMintExtensions = [];
            const { mintHasConfidentialMintBurnExtension } = await import('../../transaction-util.js');
            await expect(
                mintHasConfidentialMintBurnExtension(rpc, mint, [CONFIDENTIAL_MINT_BURN_JSON_EXT]),
            ).resolves.toBe(true);
        });

        test('is false when the node parsed every extension and none is ConfidentialMintBurn', async () => {
            mockMintExtensions = [MINT_BURN_EXT]; // would say true — must not be consulted
            const { mintHasConfidentialMintBurnExtension } = await import('../../transaction-util.js');
            await expect(
                mintHasConfidentialMintBurnExtension(rpc, mint, [{ extension: 'pausableConfig' }]),
            ).resolves.toBe(false);
        });

        test('resolves an unparseable extension by decoding the mint — true when it really is ConfidentialMintBurn', async () => {
            mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
            const { mintHasConfidentialMintBurnExtension } = await import('../../transaction-util.js');
            await expect(mintHasConfidentialMintBurnExtension(rpc, mint, [UNPARSEABLE_JSON_EXT])).resolves.toBe(true);
        });

        test('resolves an unparseable extension by decoding the mint — false for another unknown extension', async () => {
            // e.g. PermissionedBurn on a node too old to parse it: the guard must not
            // fire, or minting and burning would be disabled for the mint outright.
            mockMintExtensions = [{ __kind: 'PermissionedBurn', authority: { __option: 'None' } }];
            const { mintHasConfidentialMintBurnExtension } = await import('../../transaction-util.js');
            await expect(mintHasConfidentialMintBurnExtension(rpc, mint, [UNPARSEABLE_JSON_EXT])).resolves.toBe(false);
        });
    });

    test('createMintToTransaction does not reject on an unparseable extension that is not ConfidentialMintBurn', async () => {
        mockMintExtensions = [{ __kind: 'PermissionedBurn', authority: { __option: 'None' } }];
        seedMintDetails(rpc, {
            address: mint,
            decimals: 6,
            mintAuthority: wallet,
            extensions: [UNPARSEABLE_JSON_EXT],
        });
        const { createMintToTransaction } = await import('../mint.js');
        await expect(createMintToTransaction(rpc, mint, wallet, 1, authority, feePayer)).resolves.toBeDefined();
    });

    describe('isConfidentialMintBurnMint', () => {
        test('is true when the extension is present', async () => {
            mockMintExtensions = [TRANSFER_MINT_EXT, MINT_BURN_EXT];
            const { isConfidentialMintBurnMint } = await import('../../transaction-util.js');
            await expect(isConfidentialMintBurnMint(rpc, mint)).resolves.toBe(true);
        });

        test('is false for a confidential-balances-only mint (ConfidentialTransferMint alone)', async () => {
            mockMintExtensions = [TRANSFER_MINT_EXT];
            const { isConfidentialMintBurnMint } = await import('../../transaction-util.js');
            await expect(isConfidentialMintBurnMint(rpc, mint)).resolves.toBe(false);
        });

        test('is false when the mint has no extensions', async () => {
            mockMintExtensions = [];
            const { isConfidentialMintBurnMint } = await import('../../transaction-util.js');
            await expect(isConfidentialMintBurnMint(rpc, mint)).resolves.toBe(false);
        });
    });
});
