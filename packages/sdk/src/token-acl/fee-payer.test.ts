import type { Address, Instruction, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import {
    AccountRole,
    assertIsFullySignedTransaction,
    generateKeyPairSigner,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import type { FullTransaction } from '../transaction-util.js';
import { createMockRpc } from '../__tests__/test-utils.js';
import { TOKEN_ACL_PROGRAM_ID } from './utils.js';

const mint = 'So11111111111111111111111111111111111111112' as Address;
const gatingProgram = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const tokenAccount = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;
const tokenAccountOwner = 'FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT' as Address;

// The unit-test config maps the Token ACL SDK to a stub whose placeholder addresses can't be
// compiled into a transaction. Signing needs real account metas, so load the real builders.
const REAL_TOKEN_ACL_SDK = '../../node_modules/@solana/token-acl-sdk/dist/src/index.js';
jest.mock('@solana/token-acl-sdk', () =>
    jest.requireActual('../../node_modules/@solana/token-acl-sdk/dist/src/index.js'),
);

// A Token ACL builder's fee payer appears in no instruction as a signer (create_config takes
// `payer` as a plain writable address), so the message has to carry the fee payer's signer
// itself. Set by address only, a fee payer distinct from the authority never signs and the
// transaction can't be sent.
async function expectSignedByFeePayerAndAuthority(
    tx: FullTransaction,
    feePayer: TransactionSigner<string>,
    authority: TransactionSigner<string>,
): Promise<void> {
    expect(tx.feePayer).toBe(feePayer);

    const signed = await signTransactionMessageWithSigners(tx);
    assertIsFullySignedTransaction(signed);
    expect(Object.keys(signed.signatures).sort()).toEqual([feePayer.address, authority.address].sort());
}

describe('token-acl transaction builders attach a distinct fee payer as a signer', () => {
    let rpc: Rpc<SolanaRpcApi>;
    let feePayer: TransactionSigner<string>;
    let authority: TransactionSigner<string>;

    beforeEach(async () => {
        jest.resetModules();
        rpc = createMockRpc();
        [feePayer, authority] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    });

    test('getCreateConfigTransaction', async () => {
        const { getCreateConfigTransaction } = await import('./create-config.js');
        const { transaction } = await getCreateConfigTransaction({
            rpc,
            payer: feePayer,
            authority,
            mint,
            gatingProgram,
        });

        // The generated instruction marks the payer writable but not a signer; the fee payer
        // signer on the message is what makes its signature attach.
        const [ix] = transaction.instructions;
        expect(ix.accounts?.[0]).toEqual({ address: feePayer.address, role: AccountRole.WRITABLE });
        await expectSignedByFeePayerAndAuthority(transaction, feePayer, authority);
    });

    test('getSetGatingProgramTransaction', async () => {
        const { getSetGatingProgramTransaction } = await import('./set-gating-program.js');
        const tx = await getSetGatingProgramTransaction({ rpc, payer: feePayer, authority, mint, gatingProgram });
        await expectSignedByFeePayerAndAuthority(tx, feePayer, authority);
    });

    test('getEnablePermissionlessThawTransaction', async () => {
        const { getEnablePermissionlessThawTransaction } = await import('./enable-permissionless-thaw.js');
        const tx = await getEnablePermissionlessThawTransaction({ rpc, payer: feePayer, authority, mint });
        await expectSignedByFeePayerAndAuthority(tx, feePayer, authority);
    });

    test('getThawPermissionlessTransaction', async () => {
        // Resolving the thaw's extra metas reads the mint config and gating program accounts;
        // stub it with an instruction that carries the authority signer like the real one.
        jest.doMock('@solana/token-acl-sdk', () => ({
            ...jest.requireActual(REAL_TOKEN_ACL_SDK),
            createThawPermissionlessInstructionWithExtraMetas: jest.fn(
                async (thawAuthority: TransactionSigner<string>, account: Address): Promise<Instruction> => ({
                    programAddress: TOKEN_ACL_PROGRAM_ID,
                    accounts: [
                        { address: thawAuthority.address, role: AccountRole.READONLY_SIGNER, signer: thawAuthority },
                        { address: account, role: AccountRole.WRITABLE },
                    ] as Instruction['accounts'],
                    data: new Uint8Array([0]),
                }),
            ),
        }));
        const { getThawPermissionlessTransaction } = await import('./thaw-permissionless.js');
        const tx = await getThawPermissionlessTransaction({
            rpc,
            payer: feePayer,
            authority,
            mint,
            tokenAccount,
            tokenAccountOwner,
        });
        await expectSignedByFeePayerAndAuthority(tx, feePayer, authority);
    });
});
