import {
    type Signature,
    type TransactionSigner,
    createSolanaRpc,
    generateKeyPairSigner,
    getBase64Encoder,
} from '@solana/kit';
import { RPC_URL } from './env.js';
import { airdropAndWait } from './polling.js';
import type { Client } from './setup.js';

export { airdropAndWait, sendAndPollConfirm, type SendAndPollOptions } from './polling.js';

/**
 * A captured on-chain transaction. `wireBytes` is the exact byte sequence
 * returned by `rpc.getTransaction`, which is what we want our parser to handle.
 */
export interface OnChainTransaction {
    signature: Signature;
    wireBytes: Uint8Array;
    base64: string;
}

export interface ChainSuite {
    client: Client;
    payer: TransactionSigner<string>;
    mintAuthority: TransactionSigner<string>;
    freezeAuthority: TransactionSigner<string>;
}

/**
 * Set up a polling-based test suite against the integration cluster (`RPC_URL`, see env.ts).
 * Generates and airdrops a payer, mint authority, and freeze authority.
 */
export async function setupChainSuite(rpcUrl = RPC_URL): Promise<ChainSuite> {
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
