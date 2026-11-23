import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { generateKeyPairSigner, partiallySignTransactionMessageWithSigners } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { createMockRpc } from '../../__tests__/test-utils.js';

const mint = 'So11111111111111111111111111111111111111112' as Address;
const tokenAccount = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;

// An address-only authority is resolved to a no-op signer in both the instruction builder and the
// transaction builder. Kit refuses to sign a message with two distinct signer objects for one
// address, so both must be the same object.
describe('list transactions with an address-only authority', () => {
    let rpc: Rpc<SolanaRpcApi>;

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
        jest.doMock('../../transaction-util.js', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount,
                isInitialized: true,
                isFrozen: true,
                balance: 0n,
                uiBalance: 0,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: null,
                extensions: [],
                usesTokenAcl: false,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
        }));
    });

    test.each([
        ['allowlist', 'createAddToAllowlistTransaction'],
        ['allowlist', 'createRemoveFromAllowlistTransaction'],
        ['blocklist', 'createAddToBlocklistTransaction'],
        ['blocklist', 'createRemoveFromBlocklistTransaction'],
    ] as const)('%s %s can be signed', async (module, builder) => {
        const authority = (await generateKeyPairSigner()).address;
        const wallet = (await generateKeyPairSigner()).address;
        const lists = (await import(`../${module}.js`)) as Record<
            typeof builder,
            (rpc: Rpc<SolanaRpcApi>, mint: Address, account: Address, authority: Address) => Promise<never>
        >;

        const tx = await lists[builder](rpc, mint, wallet, authority);

        await expect(partiallySignTransactionMessageWithSigners(tx)).resolves.toBeDefined();
    });
});
