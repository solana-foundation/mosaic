import type { Address, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import {
    assertIsFullySignedTransaction,
    createNoopSigner,
    generateKeyPairSigner,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { createMockRpc } from '../../__tests__/test-utils.js';

const mint = 'So11111111111111111111111111111111111111112' as Address;
const tokenAccount = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;

function mockBurnDependencies(configuredBurnAuthority: Address | null): void {
    jest.doMock('../../transaction-util.js', () => ({
        resolveTokenAccount: jest.fn().mockResolvedValue({
            tokenAccount,
            isInitialized: true,
            isFrozen: false,
            balance: 1_000_000n,
            uiBalance: 1,
        }),
        decimalAmountToRaw: jest.fn().mockReturnValue(1_000_000n),
        getMintDetails: jest.fn().mockResolvedValue({
            decimals: 6,
            freezeAuthority: null,
            extensions: [],
            usesTokenAcl: false,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        }),
    }));
    jest.doMock('../permissioned-burn.js', () => ({
        getPermissionedBurnAuthority: jest.fn().mockResolvedValue(configuredBurnAuthority),
    }));
}

async function expectSignedBy(
    tx: Parameters<typeof signTransactionMessageWithSigners>[0],
    signers: TransactionSigner<string>[],
): Promise<void> {
    const signed = await signTransactionMessageWithSigners(tx);
    assertIsFullySignedTransaction(signed);
    expect(Object.keys(signed.signatures).sort()).toEqual([...new Set(signers.map(s => s.address))].sort());
}

// Kit refuses to sign a message that carries two distinct signer objects for one address. Now that
// the fee payer is attached as a signer, every role on the fee payer's key must share its object.
describe('createBurnTransaction: one signer object per key', () => {
    let rpc: Rpc<SolanaRpcApi>;

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
    });

    test.each([
        ['the owner address', (owner: TransactionSigner) => owner.address],
        ['a no-op signer for the owner', (owner: TransactionSigner) => createNoopSigner(owner.address)],
    ])('signs a self-burn when the fee payer is %s', async (_name, toFeePayer) => {
        mockBurnDependencies(null);
        const owner = await generateKeyPairSigner();
        const { createBurnTransaction } = await import('../burn.js');

        const tx = await createBurnTransaction(rpc, mint, owner, 1, toFeePayer(owner));

        expect(tx.feePayer).toBe(owner);
        await expectSignedBy(tx, [owner]);
    });

    test('signs when the owner is given as the fee payer address', async () => {
        mockBurnDependencies(null);
        const feePayer = await generateKeyPairSigner();
        const { createBurnTransaction } = await import('../burn.js');

        const tx = await createBurnTransaction(rpc, mint, feePayer.address, 1, feePayer);

        await expectSignedBy(tx, [feePayer]);
    });

    test('signs when the configured permissioned burn authority is the fee payer', async () => {
        const [owner, feePayer] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
        mockBurnDependencies(feePayer.address);
        const { createBurnTransaction } = await import('../burn.js');

        const tx = await createBurnTransaction(rpc, mint, owner, 1, feePayer);

        await expectSignedBy(tx, [owner, feePayer]);
    });

    test('signs when the permissioned burn authority is passed as the fee payer address', async () => {
        const [owner, feePayer] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
        mockBurnDependencies(feePayer.address);
        const { createBurnTransaction } = await import('../burn.js');

        const tx = await createBurnTransaction(rpc, mint, owner, 1, feePayer, feePayer.address);

        await expectSignedBy(tx, [owner, feePayer]);
    });
});
