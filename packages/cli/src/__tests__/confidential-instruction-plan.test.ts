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
import { getCreateAccountInstruction } from '@solana-program/system';
import {
    BlockhashExpiredError,
    flattenPlan,
    findStrandedAccounts,
    isRetryableSendError,
    PlanExecutionError,
    sendPlannedMessages,
    signSendConfirm,
    UnconfirmedTransactionError,
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
    statusError,
}: {
    statusesPerAttempt: Status[][];
    heightsPerAttempt?: bigint[][];
    sendErrors?: (Error | undefined)[];
    /** Thrown by every `getSignatureStatuses` call, e.g. a persistent HTTP 429. */
    statusError?: Error;
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
                if (statusError) throw statusError;
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
        // A base58 signature can contain "429"; that is not a rate limit.
        ['Transaction 5Kd429XyQ failed: {"InstructionError":[0,{"Custom":1}]}'],
    ])('does not retry %s', message => {
        expect(isRetryableSendError(new Error(message))).toBe(false);
    });

    it('does not retry a sent transaction whose status could not be read', () => {
        expect(isRetryableSendError(new UnconfirmedTransactionError('sig' as never, new Error('429')))).toBe(false);
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

    it('does not resend when status polling stays rate-limited after the send', async () => {
        // The first copy may still land: resending with a fresh blockhash could deposit twice.
        const { rpc, sendTransaction } = fakeRpc({
            statusesPerAttempt: [],
            statusError: new Error('HTTP error (429): Too Many Requests'),
        });
        await expect(
            signSendConfirm(rpc, buildMessage(feePayer), { pollIntervalMs: 1, rateLimitBackoffMs: 1 }),
        ).rejects.toBeInstanceOf(UnconfirmedTransactionError);
        expect(sendTransaction).toHaveBeenCalledTimes(1);
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

describe('sendPlannedMessages', () => {
    let feePayer: KeyPairSigner;
    let proofAccount: KeyPairSigner;

    beforeAll(async () => {
        feePayer = await generateKeyPairSigner();
        proofAccount = await generateKeyPairSigner();
    });

    /** Setup creates a proof account; the action and the cleanup both use it. */
    function proofFlow() {
        const setup = pipe(buildMessage(feePayer, 1), m =>
            appendTransactionMessageInstruction(
                getCreateAccountInstruction({
                    payer: feePayer,
                    newAccount: proofAccount,
                    lamports: 1_000_000n,
                    space: 100,
                    programAddress: MEMO_PROGRAM,
                }),
                m,
            ),
        );
        const usesProof = (memo: number) =>
            pipe(buildMessage(feePayer, memo), m =>
                appendTransactionMessageInstruction(
                    { programAddress: MEMO_PROGRAM, accounts: [{ address: proofAccount.address, role: 0 }] },
                    m,
                ),
            );
        return [setup, usesProof(2), usesProof(3)];
    }

    it('sends every message in order and returns their signatures', async () => {
        const { rpc, sendTransaction } = fakeRpc({
            statusesPerAttempt: [[{ confirmationStatus: 'confirmed' }], [{ confirmationStatus: 'confirmed' }]],
        });
        const signatures = await sendPlannedMessages(rpc, [buildMessage(feePayer, 1), buildMessage(feePayer, 2)], {
            pollIntervalMs: 1,
        });
        expect(signatures).toHaveLength(2);
        expect(sendTransaction).toHaveBeenCalledTimes(2);
    });

    it('reports the confirmed signatures and the unclosed proof accounts when a later step fails', async () => {
        const { rpc } = fakeRpc({
            statusesPerAttempt: [[{ confirmationStatus: 'confirmed' }], [{ err: { InstructionError: [1, 'Custom'] } }]],
        });
        const failure = sendPlannedMessages(rpc, proofFlow(), { pollIntervalMs: 1 });
        await expect(failure).rejects.toBeInstanceOf(PlanExecutionError);
        const err = (await failure.catch(e => e)) as PlanExecutionError;
        expect(err.failedIndex).toBe(1);
        expect(err.signatures).toHaveLength(1);
        expect(err.strandedAccounts).toEqual([proofAccount.address]);
        expect(err.message).toContain(proofAccount.address);
        expect(err.cause).toBeInstanceOf(Error);
    });

    it('rethrows a failure of the first message as is', async () => {
        const { rpc } = fakeRpc({ statusesPerAttempt: [[{ err: { InstructionError: [0, 'Custom'] } }]] });
        const failure = sendPlannedMessages(rpc, proofFlow(), { pollIntervalMs: 1 });
        await expect(failure).rejects.not.toBeInstanceOf(PlanExecutionError);
        await expect(failure).rejects.toThrow(/failed/);
    });
});

describe('findStrandedAccounts', () => {
    it('ignores accounts created by messages that were not sent', async () => {
        const feePayer = await generateKeyPairSigner();
        const newAccount = await generateKeyPairSigner();
        const create = pipe(buildMessage(feePayer), m =>
            appendTransactionMessageInstruction(
                getCreateAccountInstruction({
                    payer: feePayer,
                    newAccount,
                    lamports: 1n,
                    space: 0,
                    programAddress: MEMO_PROGRAM,
                }),
                m,
            ),
        );
        expect(findStrandedAccounts([buildMessage(feePayer)], [create])).toEqual([]);
    });
});
