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
