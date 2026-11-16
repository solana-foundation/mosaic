import {
    type Address,
    type Base64EncodedWireTransaction,
    type Commitment,
    type Rpc,
    type Signature,
    type SolanaRpcApi,
    SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    isSolanaError,
    lamports,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import type { FullTransaction } from '../../transaction-util.js';

// HTTP-only send/confirm and airdrop helpers. Kept in their own module (rather than in
// chain-helpers.ts) so setup.ts and helpers.ts can import them without an import cycle.

const stringifySafe = (v: unknown): string =>
    JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val));

export interface SendAndPollOptions {
    /**
     * Skip the RPC's preflight simulation. Defaults to `true`, so a failing transaction
     * lands and its error surfaces at confirmation time. Pass `false` for negative-path
     * tests: program errors then reject at simulation, before any confirmation polling.
     */
    skipPreflight?: boolean;
}

const SEND_ATTEMPTS = 3;

/**
 * sendTransaction, resending when the cluster rejected it for a reason other than the
 * transaction itself. surfpool loads unknown accounts from its remote datasource before
 * executing, and a failed fetch (public devnet drops idle connections) comes back as a -32002
 * with no `data`, which kit cannot even decode (it throws a TypeError). The transaction was
 * not processed, so resending is safe. A real preflight failure (simulation error with logs)
 * is never retried, and neither is a send whose signature the cluster already knows.
 */
async function sendWithRetry(
    rpc: Rpc<SolanaRpcApi>,
    signature: Signature,
    wire: Base64EncodedWireTransaction,
    commitment: Commitment,
    skipPreflight: boolean,
): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await rpc
                .sendTransaction(wire, { encoding: 'base64', skipPreflight, preflightCommitment: commitment })
                .send();
            return;
        } catch (error) {
            if (
                attempt >= SEND_ATTEMPTS ||
                isSolanaError(error, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)
            ) {
                throw error;
            }
            const { value } = await rpc.getSignatureStatuses([signature]).send();
            if (value[0]) return;
            await new Promise(r => setTimeout(r, 1_000));
        }
    }
}

/**
 * Send a transaction and poll for confirmation via getSignatureStatuses. We
 * intentionally don't use the kit's subscription-based confirmation flow: some
 * local clusters (surfpool in particular) don't reliably emit slot or
 * signatureSubscribe notifications, so polling is the more portable path. On a
 * failed transaction the program logs are fetched into the thrown error.
 */
export async function sendAndPollConfirm(
    rpc: Rpc<SolanaRpcApi>,
    tx: FullTransaction,
    commitment: Commitment = 'confirmed',
    timeoutMs = 30_000,
    { skipPreflight = true }: SendAndPollOptions = {},
): Promise<Signature> {
    const signed = await signTransactionMessageWithSigners(tx);
    const signature = getSignatureFromTransaction(signed);
    const wire = getBase64EncodedWireTransaction(signed);
    await sendWithRetry(rpc, signature, wire, commitment, skipPreflight);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const status = await rpc.getSignatureStatuses([signature]).send();
        const entry = status.value[0];
        if (entry?.err) {
            const fetched = await rpc
                .getTransaction(signature, {
                    commitment: 'confirmed',
                    encoding: 'base64',
                    maxSupportedTransactionVersion: 0,
                })
                .send()
                .catch(() => null);
            const logs = fetched?.meta?.logMessages?.join('\n') ?? '(no logs)';
            throw new Error(`Transaction ${signature} failed: ${stringifySafe(entry.err)}\n${logs}`);
        }
        if (
            entry?.confirmationStatus === commitment ||
            entry?.confirmationStatus === 'finalized' ||
            (commitment === 'processed' && entry?.confirmationStatus)
        ) {
            return signature;
        }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Transaction ${signature} not confirmed within ${timeoutMs}ms`);
}

/**
 * Poll-based airdrop. Requests an airdrop and waits for the recipient's balance
 * to reach the requested amount. Avoids the kit's subscription-based airdrop.
 */
export async function airdropAndWait(
    rpc: Rpc<SolanaRpcApi>,
    recipient: Address,
    sol = 1,
    timeoutMs = 30_000,
): Promise<void> {
    const want = BigInt(sol) * 1_000_000_000n;
    await rpc.requestAirdrop(recipient, lamports(want)).send();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const { value } = await rpc.getBalance(recipient).send();
        if (BigInt(value) >= want) return;
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`Airdrop to ${recipient} did not arrive within ${timeoutMs}ms`);
}
