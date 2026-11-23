import {
    address,
    appendTransactionMessageInstruction,
    blockhash,
    createTransactionMessage,
    generateKeyPairSigner,
    pipe,
    setTransactionMessageFeePayerSigner,
    type KeyPairSigner,
    type Rpc,
    type SolanaRpcApi,
    type TransactionPlan,
} from '@solana/kit';
import {
    BlockhashExpiredError,
    flattenPlan,
    isRetryableSendError,
    signSendConfirm,
    type EstimateLimits,
} from '../utils/instruction-plan';

const MEMO_PROGRAM = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const LAST_VALID_BLOCK_HEIGHT = 100n;

function buildMessage(feePayer: KeyPairSigner, memo = 1) {
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m =>
            appendTransactionMessageInstruction(
                { programAddress: MEMO_PROGRAM, accounts: [], data: new Uint8Array([memo]) },
                m,
            ),
    );
}

type Status = { err?: unknown; confirmationStatus?: 'processed' | 'confirmed' | 'finalized' } | null;

/**
 * A fake RPC. Each `sendTransaction` call starts a new attempt; `statusesPerAttempt[i]` is the
 * sequence of statuses attempt `i` sees while polling, and `heightsPerAttempt[i]` the block heights.
 */
function fakeRpc({
    statusesPerAttempt,
    heightsPerAttempt = [],
    sendErrors = [],
}: {
    statusesPerAttempt: Status[][];
    heightsPerAttempt?: bigint[][];
    sendErrors?: (Error | undefined)[];
}) {
    let attempt = -1;
    let poll = 0;
    const sendTransaction = jest.fn(() => ({
        send: async () => {
            attempt++;
            poll = 0;
            const err = sendErrors[attempt];
            if (err) throw err;
            return 'signature';
        },
    }));
    const rpc = {
        getLatestBlockhash: () => ({
            send: async () => ({
                value: {
                    blockhash: blockhash('11111111111111111111111111111111'),
                    lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT,
                },
            }),
        }),
        sendTransaction,
        getSignatureStatuses: () => ({
            send: async () => {
                const statuses = statusesPerAttempt[attempt] ?? [null];
                return { value: [statuses[Math.min(poll, statuses.length - 1)]] };
            },
        }),
        getBlockHeight: () => ({
            send: async () => {
                const heights = heightsPerAttempt[attempt] ?? [0n];
                const height = heights[Math.min(poll, heights.length - 1)];
                poll++;
                return height;
            },
        }),
    } as unknown as Rpc<SolanaRpcApi>;
    return { rpc, sendTransaction };
}

describe('isRetryableSendError', () => {
    it.each([
        ['HTTP error (429): Too Many Requests'],
        ['Transaction simulation failed: Blockhash not found'],
        ['{"BlockhashNotFound":null}'],
    ])('retries %s', message => {
        expect(isRetryableSendError(new Error(message))).toBe(true);
    });

    it('retries a transaction that expired unconfirmed', () => {
        expect(isRetryableSendError(new BlockhashExpiredError('sig' as never))).toBe(true);
    });

    // #88 retried these, which only delayed failures that repeat identically (HOO-2911, finding 2).
    it.each([
        ['Transaction sig failed: {"InstructionError":[2,"IncorrectProgramId"]}'],
        ['Attempt to debit an account but found no record of a prior credit.'],
        ['Transaction sig failed: {"InstructionError":[0,{"Custom":1}]}'],
        ['could not find account'],
        ['insufficient funds'],
    ])('does not retry %s', message => {
        expect(isRetryableSendError(new Error(message))).toBe(false);
    });
});

describe('signSendConfirm', () => {
    let feePayer: KeyPairSigner;

    beforeAll(async () => {
        feePayer = await generateKeyPairSigner();
    });

    it('returns the signature once the transaction is confirmed', async () => {
        const { rpc, sendTransaction } = fakeRpc({ statusesPerAttempt: [[null, { confirmationStatus: 'confirmed' }]] });
        await expect(signSendConfirm(rpc, buildMessage(feePayer), { pollIntervalMs: 1 })).resolves.toEqual(
            expect.any(String),
        );
        expect(sendTransaction).toHaveBeenCalledTimes(1);
    });

    it('fails at once, without resending, when the transaction failed on chain', async () => {
        const { rpc, sendTransaction } = fakeRpc({
            statusesPerAttempt: [[{ err: { InstructionError: [2, 'IncorrectProgramId'] } }]],
        });
        await expect(signSendConfirm(rpc, buildMessage(feePayer), { pollIntervalMs: 1 })).rejects.toThrow(
            /IncorrectProgramId/,
        );
        expect(sendTransaction).toHaveBeenCalledTimes(1);
    });

    it('keeps polling while the blockhash is valid instead of resending', async () => {
        // Three polls see nothing, within the blockhash's validity, then it confirms. Resending in
        // that window could land the same deposit or transfer twice.
        const { rpc, sendTransaction } = fakeRpc({
            statusesPerAttempt: [[null, null, null, { confirmationStatus: 'confirmed' }]],
            heightsPerAttempt: [[LAST_VALID_BLOCK_HEIGHT - 3n, LAST_VALID_BLOCK_HEIGHT - 2n, LAST_VALID_BLOCK_HEIGHT]],
        });
        await signSendConfirm(rpc, buildMessage(feePayer), { pollIntervalMs: 1 });
        expect(sendTransaction).toHaveBeenCalledTimes(1);
    });

    it('resends with a fresh blockhash once the first one expired unconfirmed', async () => {
        const { rpc, sendTransaction } = fakeRpc({
            statusesPerAttempt: [[null], [{ confirmationStatus: 'confirmed' }]],
            heightsPerAttempt: [[LAST_VALID_BLOCK_HEIGHT + 1n]],
        });
        await signSendConfirm(rpc, buildMessage(feePayer), { pollIntervalMs: 1 });
        expect(sendTransaction).toHaveBeenCalledTimes(2);
    });

    it('gives up after the configured attempts', async () => {
        const { rpc, sendTransaction } = fakeRpc({
            statusesPerAttempt: [[null], [null]],
            heightsPerAttempt: [[LAST_VALID_BLOCK_HEIGHT + 1n], [LAST_VALID_BLOCK_HEIGHT + 1n]],
        });
        await expect(
            signSendConfirm(rpc, buildMessage(feePayer), { pollIntervalMs: 1, attempts: 2 }),
        ).rejects.toBeInstanceOf(BlockhashExpiredError);
        expect(sendTransaction).toHaveBeenCalledTimes(2);
    });

    it('does not resend when sending itself fails for good', async () => {
        const { rpc, sendTransaction } = fakeRpc({
            statusesPerAttempt: [],
            sendErrors: [new Error('Attempt to debit an account but found no record of a prior credit.')],
        });
        await expect(signSendConfirm(rpc, buildMessage(feePayer), { pollIntervalMs: 1 })).rejects.toThrow(
            /debit an account/,
        );
        expect(sendTransaction).toHaveBeenCalledTimes(1);
    });

    it('estimates limits after setting the lifetime and before signing (version 1)', async () => {
        const { rpc } = fakeRpc({ statusesPerAttempt: [[{ confirmationStatus: 'confirmed' }]] });
        const seen: unknown[] = [];
        const estimateLimits: EstimateLimits = async message => {
            seen.push(message);
            return message;
        };
        await signSendConfirm(rpc, buildMessage(feePayer), { estimateLimits, pollIntervalMs: 1 });
        expect(seen).toHaveLength(1);
        expect(seen[0]).toHaveProperty('lifetimeConstraint.lastValidBlockHeight', LAST_VALID_BLOCK_HEIGHT);
    });
});

describe('flattenPlan', () => {
    it('lists messages depth first, parallel groups included', async () => {
        const feePayer = await generateKeyPairSigner();
        const [a, b, c] = [1, 2, 3].map(n => buildMessage(feePayer, n));
        const plan = {
            kind: 'sequential',
            divisible: true,
            plans: [
                { kind: 'single', message: a },
                {
                    kind: 'parallel',
                    plans: [
                        { kind: 'single', message: b },
                        { kind: 'single', message: c },
                    ],
                },
            ],
        } as unknown as TransactionPlan;
        expect(flattenPlan(plan)).toEqual([a, b, c]);
    });
});
