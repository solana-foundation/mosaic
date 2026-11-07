import {
    AccountRole,
    address,
    appendTransactionMessageInstruction,
    blockhash,
    createNoopSigner,
    createTransactionMessage,
    generateKeyPairSigner,
    getBase58Encoder,
    getBase64Encoder,
    getTransactionDecoder,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    verifySignature,
    type KeyPairSigner,
    type TransactionSigner,
} from '@solana/kit';
import { outputRawTransaction } from '../utils/raw-tx';
import { resolveSigners } from '../utils/solana';

const MEMO_PROGRAM = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const FEE_PAYER = address('9DMWvjE7svY2VCmpkdn5fHS7aG4msACtnMUwnhnB82wF');
const AUTHORITY = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/**
 * A message with a fee payer (a noop signer by default, as in raw mode) and one signer the CLI
 * holds a key for (like a mint or a `--permissioned-burn-keypair` co-signer).
 */
function buildMessage(held: KeyPairSigner, feePayer: TransactionSigner<string> = createNoopSigner(FEE_PAYER)) {
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m =>
            setTransactionMessageLifetimeUsingBlockhash(
                { blockhash: blockhash('11111111111111111111111111111111'), lastValidBlockHeight: 0n },
                m,
            ),
        m =>
            appendTransactionMessageInstruction(
                {
                    programAddress: MEMO_PROGRAM,
                    accounts: [{ address: held.address, role: AccountRole.READONLY_SIGNER, signer: held }],
                    data: new Uint8Array([1]),
                },
                m,
            ),
    );
}

describe('outputRawTransaction', () => {
    let log: jest.SpyInstance;

    beforeEach(() => {
        log = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        log.mockRestore();
    });

    it.each([
        ['b64', (payload: string) => getBase64Encoder().encode(payload)],
        ['b58', (payload: string) => getBase58Encoder().encode(payload)],
    ] as const)('prints a %s transaction signed only by the keys the CLI holds', async (encoding, toBytes) => {
        const held = await generateKeyPairSigner();
        await outputRawTransaction(encoding, buildMessage(held));

        expect(log).toHaveBeenCalledTimes(1);
        const tx = getTransactionDecoder().decode(toBytes(log.mock.calls[0][0] as string));

        // The noop fee payer's slot stays empty for the external signer...
        expect(tx.signatures[FEE_PAYER]).toBeNull();
        // ...while the held key (e.g. a generated mint) has signed the message.
        const heldSignature = tx.signatures[held.address];
        expect(heldSignature).not.toBeNull();
        await expect(verifySignature(held.keyPair.publicKey, heldSignature!, tx.messageBytes)).resolves.toBe(true);
    });

    it('prints the transaction when --fee-payer names a key the CLI holds (sponsored raw burn)', async () => {
        // `force-burn --raw-tx --fee-payer <X> --permissioned-burn-keypair <X's file>`: the
        // co-signer pays, so the fee payer slot belongs to a key this process holds.
        const held = await generateKeyPairSigner();
        const { feePayer } = await resolveSigners(
            { rawTx: 'b64', authority: AUTHORITY, feePayer: held.address },
            AUTHORITY,
            '--authority',
            [held],
        );
        await outputRawTransaction('b64', buildMessage(held, feePayer));

        const tx = getTransactionDecoder().decode(getBase64Encoder().encode(log.mock.calls[0][0] as string));
        const signature = tx.signatures[held.address];
        expect(signature).not.toBeNull();
        await expect(verifySignature(held.keyPair.publicKey, signature!, tx.messageBytes)).resolves.toBe(true);
    });

    it('rejects an unknown encoding without printing anything', async () => {
        const held = await generateKeyPairSigner();
        await expect(outputRawTransaction('hex', buildMessage(held))).rejects.toThrow(
            "--raw-tx must be 'b64' or 'b58'",
        );
        expect(log).not.toHaveBeenCalled();
    });
});
