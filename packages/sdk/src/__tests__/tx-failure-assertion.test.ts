import {
    appendTransactionMessageInstructions,
    createTransactionMessage,
    generateKeyPairSigner,
    getSolanaErrorFromJsonRpcError,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
    type Blockhash,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import type { FullTransaction } from '../transaction-util.js';
import { assertTxFailure } from './integration/helpers.js';
import { isInstructionFailure, TransactionFailedError } from './integration/polling.js';
import type { Client } from './integration/setup.js';

/** The error Kit raises when the RPC rejects a send at preflight with transaction error `err`. */
function preflightFailure(err: unknown) {
    return getSolanaErrorFromJsonRpcError({
        code: SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
        message: 'Transaction simulation failed',
        data: { err, logs: ['Program log: Error: denied'], accounts: null, unitsConsumed: 1n },
    });
}

/** A client whose every send is rejected with `error`, and that knows no signatures. */
function clientRejectingSendsWith(error: unknown): Client {
    const rpc = {
        sendTransaction: () => ({ send: () => Promise.reject(error) }),
        getSignatureStatuses: () => ({ send: async () => ({ value: [null] }) }),
    };
    return { rpc } as unknown as Client;
}

async function signableTransaction(): Promise<FullTransaction> {
    const payer = await generateKeyPairSigner();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(payer, m),
        m =>
            setTransactionMessageLifetimeUsingBlockhash(
                { blockhash: '11111111111111111111111111111111' as Blockhash, lastValidBlockHeight: 0n },
                m,
            ),
        m =>
            appendTransactionMessageInstructions(
                [getTransferSolInstruction({ source: payer, destination: payer.address, amount: 1n })],
                m,
            ),
    ) as FullTransaction;
}

describe('assertTxFailure', () => {
    it('passes when a program rejects the transaction at preflight', async () => {
        const client = clientRejectingSendsWith(preflightFailure({ InstructionError: [0, { Custom: 6000 }] }));
        await expect(assertTxFailure(client, await signableTransaction())).resolves.toBeUndefined();
    });

    it('fails when the send never reached a program', async () => {
        // surfpool's -32002 without `data` (a failed datasource fetch) surfaces as a TypeError
        // from Kit's decoder. A negative-path test must not count that as the program saying no.
        const client = clientRejectingSendsWith(new TypeError("Cannot destructure property 'err' of 'data'"));
        await expect(assertTxFailure(client, await signableTransaction())).rejects.toThrow();
    }, 10_000);
});

describe('isInstructionFailure', () => {
    it('accepts a preflight rejection where an instruction failed', () => {
        expect(isInstructionFailure(preflightFailure({ InstructionError: [0, { Custom: 6000 }] }))).toBe(true);
        expect(isInstructionFailure(preflightFailure({ InstructionError: [1, 'MissingRequiredSignature'] }))).toBe(
            true,
        );
    });

    it('accepts a landed transaction whose instruction failed', () => {
        const err = { InstructionError: [0, { Custom: 1 }] };
        expect(isInstructionFailure(new TransactionFailedError('sig', err))).toBe(true);
    });

    it('rejects a transaction-level failure that never reached a program', () => {
        expect(isInstructionFailure(preflightFailure('BlockhashNotFound'))).toBe(false);
        expect(isInstructionFailure(preflightFailure('AccountNotFound'))).toBe(false);
        expect(isInstructionFailure(new TransactionFailedError('sig', 'InsufficientFundsForFee'))).toBe(false);
    });

    it('rejects errors from outside the cluster', () => {
        expect(isInstructionFailure(new TypeError('undecodable response'))).toBe(false);
        expect(isInstructionFailure(new Error('fetch failed'))).toBe(false);
        expect(isInstructionFailure(undefined)).toBe(false);
    });
});
