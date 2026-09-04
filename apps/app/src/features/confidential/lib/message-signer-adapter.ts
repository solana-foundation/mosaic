import type { Address, MessagePartialSigner, SignableMessage, SignatureBytes } from '@solana/kit';

/**
 * The confidential key derivation (`deriveConfidentialKeysForOwnerMint`) signs a
 * canonical, `(owner, mint)`-bound message and feeds the raw Ed25519 signature
 * into the WASM ZK SDK. It expects a kit {@link MessagePartialSigner}
 * (`signMessages([SignableMessage]) -> [{ [address]: SignatureBytes }]`).
 *
 * `@solana/connector` only exposes a single-message
 * `signMessage(bytes) => Promise<Uint8Array>` on its transaction signer, so this
 * adapter bridges the two shapes.
 *
 * ⚠️ Key-derivation compatibility depends on the wallet signing the **raw**
 * message bytes (as the CLI's keypair signer does). Wallets that hash or prefix
 * the message before signing will derive different keys and cannot decrypt an
 * account configured elsewhere — cross-check with `mosaic confidential
 * inspect-account` when validating a new wallet.
 */

/** The single-message signing primitive `@solana/connector` exposes. */
export type ConnectorSignMessage = (message: Uint8Array) => Promise<Uint8Array>;

/** A Wallet Standard wallet, as returned by the browser's wallet registry. */
interface StandardWallet {
    accounts?: readonly { address?: string }[];
    features?: Record<string, unknown>;
}

interface SignMessageFeature {
    signMessage: (input: { account: unknown; message: Uint8Array }) => Promise<unknown>;
}

/** Did the wallet's own UI reject this, rather than the call being malformed? */
function isUserRejection(err: unknown): boolean {
    const code = (err as { code?: unknown } | null)?.code;
    if (code === 4001) return true;
    const message = err instanceof Error ? err.message : String(err ?? '');
    return /reject|denied|declin|cancel/i.test(message);
}

/**
 * Pull the raw signature bytes out of the several shapes wallets return:
 * bare bytes, Wallet Standard's `[{ signedMessage, signature }]`, or a single
 * `{ signature }`. Returns undefined rather than throwing, because a caller may
 * need to treat "no usable signature" as a reason to try another path.
 */
function toSignatureBytes(result: unknown): Uint8Array | undefined {
    if (result instanceof Uint8Array) return result;
    if (Array.isArray(result)) return toSignatureBytes(result[0]);
    const signature = (result as { signature?: unknown } | null)?.signature;
    return signature instanceof Uint8Array ? signature : undefined;
}

function extractSignature(result: unknown): Uint8Array {
    const signature = toSignatureBytes(result);
    if (!signature) throw new Error('The wallet returned an unrecognised signMessage result.');
    return signature;
}

/**
 * Signs `message` by going straight to the browser's Wallet Standard registry,
 * bypassing `@solana/connector` entirely.
 *
 * The registry holds the wallet's *genuine* `solana:signMessage` feature and its
 * real `WalletAccount` objects — which is exactly what the connector's own path
 * lacks (see {@link createResilientSignMessage}).
 */
async function signMessageViaWalletStandard(owner: Address, message: Uint8Array): Promise<Uint8Array> {
    const { getWalletsRegistry } = await import('@solana/connector');
    const wallets = getWalletsRegistry().get() as readonly unknown[] as readonly StandardWallet[];

    for (const wallet of wallets) {
        const feature = wallet?.features?.['solana:signMessage'] as SignMessageFeature | undefined;
        const account = wallet?.accounts?.find(candidate => candidate?.address === owner);
        if (typeof feature?.signMessage === 'function' && account) {
            return extractSignature(await feature.signMessage({ account, message }));
        }
    }

    throw new Error(
        `No Wallet Standard wallet in this browser exposes message signing for ${owner}. ` +
            'Confidential balances need a wallet that can sign messages.',
    );
}

/**
 * Message signing that survives `@solana/connector`'s broken message path.
 *
 * The connector scores wallets for authenticity and drops any scoring below 0.6
 * from the Wallet Standard registry — Phantom currently scores **0.595**
 * (`chunk-YTCSTE3Q.mjs:554`, `:798-806`). It then re-registers the wallet through
 * a *legacy* path that builds a wallet object with **`accounts: []`**
 * (`:1164-1175`). When `createTransactionSigner` later calls
 * `signMessage({ account, message, chain })` (`:2288`), the `account` it supplies
 * is not one of the wallet's real `WalletAccount`s, so the wallet throws while
 * dereferencing it and the connector reports the useless "Failed to sign message".
 *
 * (That legacy path *does* synthesize a raw-bytes shim at `:1154-1161`, but
 * `Object.assign(features, directWallet.features)` on the very next line
 * overwrites it with the wallet's genuine Wallet Standard features — so calling
 * the wallet object's feature with raw bytes fails too, inside the wallet.)
 *
 * For a wallet that *passes* the authenticity check the path is broken in a
 * quieter way: Wallet Standard's `signMessage` resolves to an **array** of
 * `{ signedMessage, signature }` outputs, but the connector reads `.signature`
 * off the array itself (`:2291-2295`), which is `undefined`. Nothing throws — the
 * caller just receives no signature. That surfaces downstream as the SDK's
 * "Signer … did not return a signature".
 *
 * All three defects verified unchanged in `@solana/connector` 0.2.6, so none can
 * be fixed by upgrading. Transactions are unaffected — they never take this path.
 *
 * So the Wallet Standard registry is tried **first**: it is the standard-compliant
 * path and it costs one prompt. The connector is kept only as a fallback for a
 * wallet the registry cannot serve, and a genuine user rejection is re-thrown
 * rather than retried so declining a prompt does not raise a second one.
 */
export function createResilientSignMessage(
    owner: Address | undefined,
    connectorSignMessage: ConnectorSignMessage | undefined,
): ConnectorSignMessage | undefined {
    if (!owner) return undefined;

    return async (message: Uint8Array): Promise<Uint8Array> => {
        try {
            return await signMessageViaWalletStandard(owner, message);
        } catch (err) {
            if (isUserRejection(err) || !connectorSignMessage) throw err;
            // Last resort. Its result is validated because the connector can
            // resolve with `undefined` instead of failing.
            const signature = toSignatureBytes(await connectorSignMessage(message));
            if (!signature) throw err;
            return signature;
        }
    };
}

/**
 * Wraps a connector `signMessage` into a kit {@link MessagePartialSigner} bound
 * to `address`, so it can drive `deriveConfidentialKeysForOwnerMint`.
 */
export function createConnectorMessageSigner(
    address: Address,
    signMessage: ConnectorSignMessage,
): MessagePartialSigner {
    return {
        address,
        async signMessages(messages: readonly SignableMessage[]) {
            return Promise.all(
                messages.map(async message => {
                    const signature = await signMessage(new Uint8Array(message.content));
                    return { [address]: signature as SignatureBytes } as Record<Address, SignatureBytes>;
                }),
            );
        },
    };
}
