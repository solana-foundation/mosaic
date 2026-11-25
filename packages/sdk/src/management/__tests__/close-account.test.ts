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
const destination = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const tokenAccount = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;

function mockTransactionUtil(): void {
    jest.doMock('../../transaction-util.js', () => ({
        resolveTokenAccount: jest.fn().mockResolvedValue({
            tokenAccount,
            isInitialized: true,
            isFrozen: false,
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
}

describe('createCloseAccountTransaction', () => {
    let rpc: Rpc<SolanaRpcApi>;

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
    });

    test('attaches the fee payer signer when it is not the owner', async () => {
        mockTransactionUtil();
        const [owner, feePayer] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
        const { createCloseAccountTransaction } = await import('../close-account.js');
        const tx = await createCloseAccountTransaction(rpc, mint, owner, destination, feePayer);

        // The fee payer signs no account in the close instruction, so the message must carry its
        // signer itself; set by address, it would never sign and the transaction couldn't be sent.
        expect(tx.feePayer).toBe(feePayer);

        const signed = await signTransactionMessageWithSigners(tx);
        assertIsFullySignedTransaction(signed);
        expect(Object.keys(signed.signatures).sort()).toEqual([feePayer.address, owner.address].sort());
    });

    // Kit refuses to sign a message that carries two distinct signer objects for one address.
    test.each([
        ['the owner address', (owner: TransactionSigner) => owner.address],
        ['a no-op signer for the owner', (owner: TransactionSigner) => createNoopSigner(owner.address)],
    ])('signs when the fee payer is %s', async (_name, toFeePayer) => {
        mockTransactionUtil();
        const owner = await generateKeyPairSigner();
        const { createCloseAccountTransaction } = await import('../close-account.js');
        const tx = await createCloseAccountTransaction(rpc, mint, owner, destination, toFeePayer(owner));

        expect(tx.feePayer).toBe(owner);
        const signed = await signTransactionMessageWithSigners(tx);
        assertIsFullySignedTransaction(signed);
        expect(Object.keys(signed.signatures)).toEqual([owner.address]);
    });

    test('signs when the owner is given as the fee payer address', async () => {
        mockTransactionUtil();
        const feePayer = await generateKeyPairSigner();
        const { createCloseAccountTransaction } = await import('../close-account.js');
        const tx = await createCloseAccountTransaction(rpc, mint, feePayer.address, destination, feePayer);

        const signed = await signTransactionMessageWithSigners(tx);
        assertIsFullySignedTransaction(signed);
        expect(Object.keys(signed.signatures)).toEqual([feePayer.address]);
    });
});
