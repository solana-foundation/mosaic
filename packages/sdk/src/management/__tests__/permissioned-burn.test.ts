import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { none, some } from '@solana/kit';
import {
    extension,
    getMintEncoder,
    TOKEN_2022_PROGRAM_ADDRESS,
    BURN_CHECKED_DISCRIMINATOR,
    PERMISSIONED_BURN_CHECKED_DISCRIMINATOR,
    PERMISSIONED_BURN_CHECKED_PERMISSIONED_BURN_DISCRIMINATOR,
} from '@solana-program/token-2022';
import { createMockSigner, createMockRpc, TEST_AUTHORITY } from '../../__tests__/test-utils';

// Valid base58 addresses (must decode to 32 bytes for the mint encoder)
const mint = 'So11111111111111111111111111111111111111112' as Address;
const wallet = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const tokenAccount = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;
const burnAuthority = TEST_AUTHORITY;

function seedEncodedMint(rpc: Rpc<SolanaRpcApi>, input: { permissionedBurnAuthority?: Address | null }): void {
    const extensions =
        input.permissionedBurnAuthority === undefined
            ? none<never[]>()
            : some([
                  extension('PermissionedBurn', {
                      authority: input.permissionedBurnAuthority ? some(input.permissionedBurnAuthority) : none(),
                  }),
              ]);
    const data = getMintEncoder().encode({
        mintAuthority: some(wallet),
        supply: 0n,
        decimals: 6,
        isInitialized: true,
        freezeAuthority: none(),
        extensions,
    });
    const reg = (rpc as unknown as { __registry: { accountInfoRegistry: Map<string, unknown> } }).__registry;
    reg.accountInfoRegistry.set(mint as string, {
        owner: TOKEN_2022_PROGRAM_ADDRESS,
        base64: Buffer.from(data).toString('base64'),
    });
}

function mockTransactionUtil(): void {
    jest.doMock('../../transaction-util', () => ({
        resolveTokenAccount: jest.fn().mockResolvedValue({
            tokenAccount,
            isInitialized: true,
            isFrozen: false,
            balance: 1000000n,
            uiBalance: 1,
        }),
        decimalAmountToRaw: jest.fn().mockReturnValue(1000000n),
        getMintDetails: jest.fn().mockResolvedValue({
            decimals: 6,
            freezeAuthority: null,
            extensions: [],
            usesTokenAcl: false,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
        mintHasConfidentialMintBurnExtension: jest.fn().mockReturnValue(false),
    }));
}

describe('permissioned-burn', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner('Fee777777777777777777777777777777777777');
    const burnAuthoritySigner = createMockSigner(burnAuthority);

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
    });

    describe('getPermissionedBurnAuthority', () => {
        test('returns the configured authority', async () => {
            seedEncodedMint(rpc, { permissionedBurnAuthority: burnAuthority });
            const { getPermissionedBurnAuthority } = await import('../permissioned-burn');
            await expect(getPermissionedBurnAuthority(rpc, mint)).resolves.toBe(burnAuthority);
        });

        test('returns null when the extension is absent', async () => {
            seedEncodedMint(rpc, {});
            const { getPermissionedBurnAuthority } = await import('../permissioned-burn');
            await expect(getPermissionedBurnAuthority(rpc, mint)).resolves.toBeNull();
        });

        test('returns null when the authority was cleared', async () => {
            seedEncodedMint(rpc, { permissionedBurnAuthority: null });
            const { getPermissionedBurnAuthority } = await import('../permissioned-burn');
            await expect(getPermissionedBurnAuthority(rpc, mint)).resolves.toBeNull();
        });

        test('returns null when the mint account does not exist', async () => {
            const { getPermissionedBurnAuthority } = await import('../permissioned-burn');
            await expect(getPermissionedBurnAuthority(rpc, mint)).resolves.toBeNull();
        });
    });

    describe('validatePermissionedBurnForMint', () => {
        test('passes with the correct authority', async () => {
            seedEncodedMint(rpc, { permissionedBurnAuthority: burnAuthority });
            const { validatePermissionedBurnForMint } = await import('../permissioned-burn');
            await expect(validatePermissionedBurnForMint(rpc, mint, burnAuthority)).resolves.toBeUndefined();
        });

        test('throws when the extension is absent', async () => {
            seedEncodedMint(rpc, {});
            const { validatePermissionedBurnForMint } = await import('../permissioned-burn');
            await expect(validatePermissionedBurnForMint(rpc, mint)).rejects.toThrow(
                'does not have permissioned burn extension enabled',
            );
        });

        test('throws on authority mismatch', async () => {
            seedEncodedMint(rpc, { permissionedBurnAuthority: burnAuthority });
            const { validatePermissionedBurnForMint } = await import('../permissioned-burn');
            await expect(validatePermissionedBurnForMint(rpc, mint, wallet)).rejects.toThrow(
                'Permissioned burn authority mismatch',
            );
        });
    });

    describe('createPermissionedBurnTransaction', () => {
        test('builds a permissioned burn checked instruction with both signers', async () => {
            mockTransactionUtil();
            const { createPermissionedBurnTransaction } = await import('../permissioned-burn');
            const tx = await createPermissionedBurnTransaction(rpc, mint, wallet, 1, burnAuthoritySigner, feePayer);

            expect(tx.instructions).toHaveLength(1);
            const ix = tx.instructions[0];
            expect(ix.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
            expect(ix.data?.[0]).toBe(PERMISSIONED_BURN_CHECKED_DISCRIMINATOR);
            expect(ix.data?.[1]).toBe(PERMISSIONED_BURN_CHECKED_PERMISSIONED_BURN_DISCRIMINATOR);
            // account, mint, permissionedBurnAuthority, authority
            expect(ix.accounts).toHaveLength(4);
            expect(ix.accounts?.[2].address).toBe(burnAuthority);
            expect(ix.accounts?.[3].address).toBe(wallet);
        });
    });

    describe('burn path routing', () => {
        test('createBurnTransaction routes to permissioned burn when the extension is present', async () => {
            seedEncodedMint(rpc, { permissionedBurnAuthority: burnAuthority });
            mockTransactionUtil();
            const { createBurnTransaction } = await import('../burn');
            const tx = await createBurnTransaction(rpc, mint, wallet, 1, feePayer);

            expect(tx.instructions).toHaveLength(1);
            const ix = tx.instructions[0];
            expect(ix.data?.[0]).toBe(PERMISSIONED_BURN_CHECKED_DISCRIMINATOR);
            expect(ix.data?.[1]).toBe(PERMISSIONED_BURN_CHECKED_PERMISSIONED_BURN_DISCRIMINATOR);
            // Co-signer defaults to the authority configured on the mint
            expect(ix.accounts?.[2].address).toBe(burnAuthority);
        });

        test('createBurnTransaction uses a regular burn when the extension is absent', async () => {
            seedEncodedMint(rpc, {});
            mockTransactionUtil();
            const { createBurnTransaction } = await import('../burn');
            const tx = await createBurnTransaction(rpc, mint, wallet, 1, feePayer);

            expect(tx.instructions).toHaveLength(1);
            expect(tx.instructions[0].data?.[0]).toBe(BURN_CHECKED_DISCRIMINATOR);
        });

        test('createForceBurnTransaction co-signs with the delegate when it is the burn authority', async () => {
            seedEncodedMint(rpc, { permissionedBurnAuthority: burnAuthority });
            mockTransactionUtil();
            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 1, burnAuthoritySigner, feePayer);

            expect(tx.instructions).toHaveLength(1);
            const ix = tx.instructions[0];
            expect(ix.data?.[0]).toBe(PERMISSIONED_BURN_CHECKED_DISCRIMINATOR);
            expect(ix.accounts?.[2].address).toBe(burnAuthority);
            expect(ix.accounts?.[3].address).toBe(burnAuthority);
        });

        test('createForceBurnTransaction keeps a regular burn when the extension is absent', async () => {
            seedEncodedMint(rpc, {});
            mockTransactionUtil();
            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 1, burnAuthoritySigner, feePayer);

            expect(tx.instructions).toHaveLength(1);
            expect(tx.instructions[0].data?.[0]).toBe(BURN_CHECKED_DISCRIMINATOR);
        });
    });
});
