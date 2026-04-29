import {
    type Address,
    type Commitment,
    type Rpc,
    type Signature,
    type SolanaRpcApi,
    type TransactionSigner,
    createSolanaRpc,
    generateKeyPairSigner,
    getBase64Encoder,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    lamports,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import type { FullTransaction } from '../../transaction-util';
import type { Client } from './setup';

/**
 * A captured on-chain transaction. `wireBytes` is the exact byte sequence
 * returned by `rpc.getTransaction`, which is what we want our parser to handle.
 */
export interface OnChainTransaction {
    signature: Signature;
    wireBytes: Uint8Array;
    base64: string;
}

const stringifySafe = (v: unknown): string =>
    JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val));

/**
 * Send a transaction and poll for confirmation via getSignatureStatuses. We
 * intentionally don't use the kit's subscription-based confirmation flow: some
 * local validators (the ones we run for these tests) don't reliably emit
 * signatureSubscribe notifications, so polling is the more portable path.
 */
export async function sendAndPollConfirm(
    rpc: Rpc<SolanaRpcApi>,
    tx: FullTransaction,
    commitment: Commitment = 'confirmed',
    timeoutMs = 30_000,
): Promise<Signature> {
    const signed = await signTransactionMessageWithSigners(tx);
    const signature = getSignatureFromTransaction(signed);
    const wire = getBase64EncodedWireTransaction(signed);
    await rpc
        .sendTransaction(wire, { encoding: 'base64', skipPreflight: true, preflightCommitment: commitment })
        .send();

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const status = await rpc.getSignatureStatuses([signature]).send();
        const entry = status.value[0];
        if (entry?.err) {
            throw new Error(`Transaction ${signature} failed: ${stringifySafe(entry.err)}`);
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

export interface ChainSuite {
    client: Client;
    payer: TransactionSigner<string>;
    mintAuthority: TransactionSigner<string>;
    freezeAuthority: TransactionSigner<string>;
}

/**
 * Set up a polling-based test suite against a local Solana RPC at 127.0.0.1:8899.
 * Generates and airdrops a payer, mint authority, and freeze authority.
 */
export async function setupChainSuite(rpcUrl = 'http://127.0.0.1:8899'): Promise<ChainSuite> {
    const rpc = createSolanaRpc(rpcUrl);
    const client = { rpc, rpcSubscriptions: undefined as never } as unknown as Client;
    const [payer, mintAuthority, freezeAuthority] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);
    await Promise.all([
        airdropAndWait(rpc, payer.address),
        airdropAndWait(rpc, mintAuthority.address),
        airdropAndWait(rpc, freezeAuthority.address),
    ]);
    return { client, payer, mintAuthority, freezeAuthority };
}

/** Fetch a confirmed transaction back from the cluster as raw wire bytes. */
export async function fetchOnChainTransaction(client: Client, signature: Signature): Promise<OnChainTransaction> {
    const tx = await client.rpc
        .getTransaction(signature, {
            commitment: 'confirmed',
            encoding: 'base64',
            maxSupportedTransactionVersion: 0,
        })
        .send();
    if (!tx) {
        throw new Error(`Transaction ${signature} not found on chain`);
    }
    const [base64] = tx.transaction;
    const wireBytes = new Uint8Array(getBase64Encoder().encode(base64));
    return { signature, wireBytes, base64 };
}

/**
 * The minimal subset of a getTransaction response we need to drive
 * parseConfirmedTransaction: wire bytes plus inner-instructions and
 * LUT-loaded addresses from meta.
 */
export interface ConfirmedTransactionSnapshot {
    signature: Signature;
    base64: string;
    innerInstructions: ReadonlyArray<{
        index: number;
        instructions: ReadonlyArray<{
            programIdIndex: number;
            accounts: readonly number[];
            data: string;
            stackHeight?: number | null;
        }>;
    }>;
    loadedAddresses: { writable: readonly string[]; readonly: readonly string[] } | null;
    err: unknown;
}

/** Fetch and capture the parts of a confirmed tx response we need for inner-ix parsing. */
export async function fetchConfirmedTransactionSnapshot(
    client: Client,
    signature: Signature,
): Promise<ConfirmedTransactionSnapshot> {
    const tx = await client.rpc
        .getTransaction(signature, {
            commitment: 'confirmed',
            encoding: 'base64',
            maxSupportedTransactionVersion: 0,
        })
        .send();
    if (!tx) {
        throw new Error(`Transaction ${signature} not found on chain`);
    }
    const [base64] = tx.transaction;
    const inner = tx.meta?.innerInstructions ?? [];
    const loaded = tx.meta?.loadedAddresses ?? null;
    return {
        signature,
        base64,
        innerInstructions: inner.map(group => ({
            index: group.index,
            instructions: group.instructions.map(ix => ({
                programIdIndex: ix.programIdIndex,
                accounts: [...ix.accounts],
                data: ix.data,
                stackHeight: ix.stackHeight ?? null,
            })),
        })),
        loadedAddresses: loaded ? { writable: [...loaded.writable], readonly: [...loaded.readonly] } : null,
        err: tx.meta?.err ?? null,
    };
}
