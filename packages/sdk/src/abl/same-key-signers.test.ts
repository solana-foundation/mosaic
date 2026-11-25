import type { Address, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import {
    assertIsFullySignedTransaction,
    createNoopSigner,
    generateKeyPairSigner,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import type { FullTransaction } from '../transaction-util.js';
import { createMockRpc } from '../__tests__/test-utils.js';

// The unit-test config maps the ABL and Token ACL SDKs to stubs whose placeholder addresses can't
// be compiled into a transaction. Signing needs real account metas, so load the real builders.
jest.mock('@solana/token-acl-gate-sdk', () =>
    jest.requireActual('../../node_modules/@solana/token-acl-gate-sdk/dist/src/index.js'),
);
jest.mock('@solana/token-acl-sdk', () =>
    jest.requireActual('../../node_modules/@solana/token-acl-sdk/dist/src/index.js'),
);

const mint = 'So11111111111111111111111111111111111111112' as Address;
const wallet = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const list = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;

// Kit refuses to sign a message with two distinct signer objects for one address. A no-op payer
// next to the real authority for the same key must resolve to the authority's signer, in the
// instruction's payer account as well as on the message.
describe('ABL transaction builders share one signer when the payer is the authority key', () => {
    let rpc: Rpc<SolanaRpcApi>;
    let authority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;

    beforeEach(async () => {
        rpc = createMockRpc();
        authority = await generateKeyPairSigner();
        payer = createNoopSigner(authority.address);
    });

    async function expectSignedByAuthorityOnly(tx: FullTransaction): Promise<void> {
        expect(tx.feePayer).toBe(authority);
        const signed = await signTransactionMessageWithSigners(tx);
        assertIsFullySignedTransaction(signed);
        expect(Object.keys(signed.signatures)).toEqual([authority.address]);
    }

    test('getCreateListTransaction', async () => {
        const { getCreateListTransaction } = await import('./list.js');
        const { transaction } = await getCreateListTransaction({ rpc, payer, authority, mint });
        await expectSignedByAuthorityOnly(transaction);
    });

    test('getSetExtraMetasTransaction', async () => {
        const { getSetExtraMetasTransaction } = await import('./set-extra-metas.js');
        await expectSignedByAuthorityOnly(
            await getSetExtraMetasTransaction({ rpc, payer, authority, mint, addresses: [list] }),
        );
    });

    test('getAddWalletTransaction', async () => {
        const { getAddWalletTransaction } = await import('./wallet.js');
        await expectSignedByAuthorityOnly(await getAddWalletTransaction({ rpc, payer, authority, wallet, list }));
    });

    test('getRemoveWalletTransaction', async () => {
        const { getRemoveWalletTransaction } = await import('./wallet.js');
        await expectSignedByAuthorityOnly(await getRemoveWalletTransaction({ rpc, payer, authority, wallet, list }));
    });
});
