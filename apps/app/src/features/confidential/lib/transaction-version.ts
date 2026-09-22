import { createSolanaRpc, type Rpc, type GetVersionApi } from '@solana/kit';

/**
 * Decides which transaction format the app plans confidential operations into.
 *
 * The SDK's confidential planner packs version-0 messages by default and takes a
 * `version: 1` option for [SIMD-0385](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0385-transaction-v1.md)
 * messages, which raise the per-transaction budget from 1232 to 4096 bytes and
 * therefore fold proof setup, the token instruction and cleanup into far fewer
 * transactions — fewer wallet prompts, fewer round trips, less context-state
 * rent churn for the same operation.
 *
 * Version 1 is a wire-compatibility choice, so it is gated on both ends of the
 * path actually supporting it:
 *
 * - **The RPC** must run Agave ≥ 4.2.2, the release that ships the `txv1`
 *   feature gate. The app lets users point at an arbitrary custom endpoint, so
 *   this cannot be inferred from the cluster name.
 * - **The wallet** must be able to sign a version-1 wire transaction. The app
 *   signs through `@solana/connector`'s `TransactionModifyingSigner`, which is
 *   Wallet Standard's `solana:signTransaction` — a feature that advertises the
 *   versions it accepts.
 *
 * Both are probed at runtime rather than assumed, so the app picks version 1 up
 * automatically once wallets ship support and stays on version 0 — the behaviour
 * it has always had — until then.
 */

/** Transaction format the confidential planner packs into. Mirrors the SDK's `ConfidentialTransactionVersion`. */
export type ConfidentialTxVersion = 0 | 1;

/** The Agave release that ships the `txv1` feature gate. */
const MIN_AGAVE_VERSION = [4, 2, 2] as const;

/**
 * Forces version 1, skipping the wallet probe, so the path can be exercised
 * against a wallet or validator that supports it before the Wallet Standard
 * feature advertises it.
 *
 * Must be a literal member access — Next.js only inlines `NEXT_PUBLIC_*` that
 * way (same constraint as `getEnvNetwork` in `lib/solana/network.ts`).
 */
export function isTransactionV1Forced(): boolean {
    return process.env.NEXT_PUBLIC_CONFIDENTIAL_TX_VERSION === '1';
}

/** Compares a `major.minor.patch` string against {@link MIN_AGAVE_VERSION}. */
function meetsMinimumVersion(solanaCore: string): boolean {
    // Agave reports things like "4.2.2" and "3.0.11-mod"; take the leading numeric triple.
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(solanaCore);
    if (!match) return false;
    const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
    for (let i = 0; i < MIN_AGAVE_VERSION.length; i++) {
        if (parts[i] !== MIN_AGAVE_VERSION[i]) return parts[i] > MIN_AGAVE_VERSION[i];
    }
    return true;
}

/**
 * Cached per endpoint URL. The probe is one `getVersion` call and the answer
 * cannot change under a running node, so every caller — the wizard and the
 * notice both ask — shares one in-flight request.
 */
const rpcProbes = new Map<string, Promise<boolean>>();

/** Whether the RPC at `url` runs a release that accepts version-1 transactions. */
export function rpcSupportsTransactionV1(url: string): Promise<boolean> {
    const cached = rpcProbes.get(url);
    if (cached) return cached;

    const probe = (async () => {
        try {
            const rpc = createSolanaRpc(url) as Rpc<GetVersionApi>;
            const version = await rpc.getVersion().send();
            return meetsMinimumVersion(version['solana-core']);
        } catch {
            // An unreachable or non-conforming endpoint tells us nothing, and
            // version 0 is the safe answer to "we don't know".
            return false;
        }
    })();

    rpcProbes.set(url, probe);
    return probe;
}
