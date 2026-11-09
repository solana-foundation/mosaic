import type { Address, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import { AccountRole, createNoopSigner, generateKeyPairSigner, signTransactionMessageWithSigners } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { createMockRpc } from '../../__tests__/test-utils.js';
import { decimalAmountToRaw } from '../../transaction-util.js';

// On an SRFC-37 mint whose new accounts are born frozen, minting to a frozen
// account adds a permissionless thaw signed by the mint authority. When the mint
// authority is the fee payer's key, the thaw and the ATA creation must carry the
// same signer object, or Kit refuses to sign the transaction.
describe('createMintToTransaction: mint authority on the fee payer key', () => {
    let rpc: Rpc<SolanaRpcApi>;

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
        jest.doMock('../../transaction-util.js', () => ({
            resolveTokenAccount: jest.fn(async () => ({
                tokenAccount: (await generateKeyPairSigner()).address,
                isInitialized: true,
                isFrozen: true,
                balance: 0n,
                uiBalance: 0,
            })),
            decimalAmountToRaw,
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                extensions: [],
                usesTokenAcl: true,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(true),
        }));
        // Stand-in thaw that, like the real one, requires the authority's signature.
        jest.doMock('../../token-acl/index.js', () => ({
            getThawPermissionlessInstructions: jest.fn(async ({ authority }: { authority: TransactionSigner }) => [
                {
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                    accounts: [{ address: authority.address, role: AccountRole.READONLY_SIGNER, signer: authority }],
                },
            ]),
        }));
    });

    test.each([
        ['the fee payer address', (feePayer: TransactionSigner) => feePayer.address],
        // e.g. a no-op signer for the key next to the wallet's own signer.
        ['a different signer object for it', (feePayer: TransactionSigner) => createNoopSigner(feePayer.address)],
    ])('signs when the mint authority is %s', async (_name, toMintAuthority) => {
        const { createMintToTransaction } = await import('../mint.js');
        const feePayer = await generateKeyPairSigner();
        const mint = (await generateKeyPairSigner()).address as Address;
        const recipient = (await generateKeyPairSigner()).address as Address;

        const tx = await createMintToTransaction(rpc, mint, recipient, 1, toMintAuthority(feePayer), feePayer);

        await expect(signTransactionMessageWithSigners(tx as never)).resolves.toBeDefined();
    });
});
