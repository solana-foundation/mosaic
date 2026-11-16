import type { Address } from '@solana/kit';
import { assertIsFullySignedTransaction, generateKeyPairSigner, signTransactionMessageWithSigners } from '@solana/kit';
import { createMockRpc } from '../__tests__/test-utils.js';
import { getRemoveWalletTransaction } from './wallet.js';

// The unit-test config maps the gate SDK to a stub whose placeholder addresses can't be compiled
// into a transaction. Signing needs real account metas, so load the real builders.
jest.mock('@solana/token-acl-gate-sdk', () =>
    jest.requireActual('../../node_modules/@solana/token-acl-gate-sdk/dist/src/index.js'),
);

const wallet = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const list = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;

describe('getRemoveWalletTransaction', () => {
    test('attaches the fee payer signer when it is not the list authority', async () => {
        const [feePayer, authority] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
        const tx = await getRemoveWalletTransaction({ rpc: createMockRpc(), payer: feePayer, authority, wallet, list });

        // remove_wallet takes no payer account (unlike add_wallet), so the message must carry the
        // fee payer's signer itself; set by address, it would never sign.
        expect(tx.feePayer).toBe(feePayer);

        const signed = await signTransactionMessageWithSigners(tx);
        assertIsFullySignedTransaction(signed);
        expect(Object.keys(signed.signatures).sort()).toEqual([feePayer.address, authority.address].sort());
    });
});
