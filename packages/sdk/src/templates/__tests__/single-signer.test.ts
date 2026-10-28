import type { Address, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import { generateKeyPairSigner, signTransactionMessageWithSigners } from '@solana/kit';
import { createMockRpc } from '../../__tests__/test-utils.js';
import type { FullTransaction } from '../../transaction-util.js';
import { createArcadeTokenInitTransaction } from '../arcade-token.js';
import { createCustomTokenInitTransaction } from '../custom-token.js';
import { createMmfInitTransaction } from '../mmf.js';
import { createStablecoinInitTransaction } from '../stablecoin.js';
import { createTokenizedSecurityInitTransaction } from '../tokenized-security.js';

// The single-signer path passes the mint authority as `feePayer.address`. If a
// template wrapped that address in its own no-op signer, the transaction would
// hold two signer objects for one address and Kit would refuse to sign it.
type Template = (
    rpc: Rpc<SolanaRpcApi>,
    mintAuthority: Address | TransactionSigner<string>,
    mint: TransactionSigner<string>,
    feePayer: Address | TransactionSigner<string>,
) => Promise<FullTransaction>;

const templates: [string, Template][] = [
    [
        'stablecoin',
        (rpc, auth, mint, payer) => createStablecoinInitTransaction(rpc, 'N', 'S', 6, 'u', auth, mint, payer),
    ],
    [
        'arcade token',
        (rpc, auth, mint, payer) => createArcadeTokenInitTransaction(rpc, 'N', 'S', 0, 'u', auth, mint, payer),
    ],
    [
        'tokenized security',
        (rpc, auth, mint, payer) => createTokenizedSecurityInitTransaction(rpc, 'N', 'S', 6, 'u', auth, mint, payer),
    ],
    ['mmf', (rpc, auth, mint, payer) => createMmfInitTransaction(rpc, 'N', 'S', 6, 'u', auth, mint, payer)],
    [
        'custom token',
        (rpc, auth, mint, payer) =>
            createCustomTokenInitTransaction(rpc, 'N', 'S', 6, 'u', auth, mint, payer, { enableMetadata: true }),
    ],
];

describe.each(templates)('%s template, single signer', (_name, build) => {
    it('signs when the mint authority is given as the fee payer address', async () => {
        const feePayer = await generateKeyPairSigner();
        const mint = await generateKeyPairSigner();
        const tx = await build(createMockRpc(), feePayer.address, mint, feePayer);
        await expect(signTransactionMessageWithSigners(tx as never)).resolves.toBeDefined();
    });

    it('signs when the fee payer is given as the mint authority address', async () => {
        const mintAuthority = await generateKeyPairSigner();
        const mint = await generateKeyPairSigner();
        const tx = await build(createMockRpc(), mintAuthority, mint, mintAuthority.address);
        await expect(signTransactionMessageWithSigners(tx as never)).resolves.toBeDefined();
    });
});
