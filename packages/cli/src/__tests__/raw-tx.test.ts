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
} from '@solana/kit';
import { outputRawTransaction } from '../utils/raw-tx';

const MEMO_PROGRAM = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const FEE_PAYER = address('9DMWvjE7svY2VCmpkdn5fHS7aG4msACtnMUwnhnB82wF');

/** A message with a noop fee payer (as in raw mode) and one signer the CLI holds a key for (like a mint). */
function buildMessage(held: KeyPairSigner) {
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(createNoopSigner(FEE_PAYER), m),
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

    it('rejects an unknown encoding without printing anything', async () => {
        const held = await generateKeyPairSigner();
        await expect(outputRawTransaction('hex', buildMessage(held))).rejects.toThrow(
            "--raw-tx must be 'b64' or 'b58'",
        );
        expect(log).not.toHaveBeenCalled();
    });
});
