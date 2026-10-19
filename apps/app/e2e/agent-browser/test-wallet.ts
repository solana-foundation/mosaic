// Devnet-only Wallet Standard wallet for browser-driven UI testing.
//
// Bundled by `build-test-wallet.mjs` into an IIFE and loaded with
// `agent-browser --init-script`, so it registers before the app's own scripts
// run. `@solana/connector` discovers it through the Wallet Standard registry
// like any extension wallet, and it shows up in the wallet modal as
// "Mosaic Test Wallet".
//
// It signs everything it is asked to without prompting. That is only acceptable
// because it holds the shared devnet test key and refuses any chain other than
// `solana:devnet`.
//
// The secret key is never in this file: the build injects it through
// `__MOSAIC_TEST_SECRET_KEY__`, and the bundle is written to the gitignored
// `apps/app/.agent-browser/` directory.

import {
    createKeyPairFromBytes,
    getAddressFromPublicKey,
    getBase58Encoder,
    getTransactionDecoder,
    getTransactionEncoder,
    partiallySignTransaction,
    signBytes,
} from '@solana/kit';
import { registerWallet, type Wallet, type WalletAccount } from '@wallet-standard/core';

declare const __MOSAIC_TEST_SECRET_KEY__: number[];

const WALLET_NAME = 'Mosaic Test Wallet';
const DEVNET = 'solana:devnet';
const CHAINS = [DEVNET] as const;
const ACCOUNT_FEATURES = ['solana:signTransaction', 'solana:signMessage'] as const;

// A purple rounded square with a "T", so the test wallet is easy to spot in the
// wallet modal.
const ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#9945FF"/>' +
    '<text x="16" y="21" font-size="14" font-family="sans-serif" fill="#fff" text-anchor="middle">T</text></svg>';
const ICON = `data:image/svg+xml;base64,${btoa(ICON_SVG)}` as const;

interface SignTransactionInput {
    account: WalletAccount;
    chain?: string;
    // The standard shape is a single `transaction`. `@solana/connector` 0.1.4
    // first tries a non-standard `transactions: [...]` shape and only falls back
    // to the standard one if that throws, so accept both rather than make every
    // sign go through a caught error.
    transaction?: Uint8Array;
    transactions?: Uint8Array[];
}

interface SignMessageInput {
    account: WalletAccount;
    message: Uint8Array;
}

type ChangeListener = (properties: { accounts?: readonly WalletAccount[] }) => void;

function assertDevnet(chain: string | undefined): void {
    if (chain !== DEVNET) {
        throw new Error(
            `${WALLET_NAME} only signs for ${DEVNET}; the app asked for ${chain ?? 'an unspecified chain'}. ` +
                'Switch the app to Devnet.',
        );
    }
}

async function createTestWallet(): Promise<Wallet> {
    const secretKey = new Uint8Array(__MOSAIC_TEST_SECRET_KEY__);
    const keyPair = await createKeyPairFromBytes(secretKey);
    const address = await getAddressFromPublicKey(keyPair.publicKey);
    // An address is the base58 encoding of the 32-byte public key.
    const publicKey = new Uint8Array(getBase58Encoder().encode(address));

    const account: WalletAccount = {
        address,
        publicKey,
        chains: CHAINS,
        features: ACCOUNT_FEATURES,
        label: WALLET_NAME,
    };

    let connected = false;
    const listeners = new Set<ChangeListener>();
    const emitChange = () => {
        for (const listener of listeners) listener({ accounts: connected ? [account] : [] });
    };

    const decoder = getTransactionDecoder();
    const encoder = getTransactionEncoder();
    const signWireTransaction = async (bytes: Uint8Array): Promise<Uint8Array> => {
        const signed = await partiallySignTransaction([keyPair], decoder.decode(bytes));
        return new Uint8Array(encoder.encode(signed));
    };

    return {
        version: '1.0.0',
        name: WALLET_NAME,
        icon: ICON,
        chains: CHAINS,
        get accounts() {
            return connected ? [account] : [];
        },
        features: {
            'standard:connect': {
                version: '1.0.0',
                connect: async () => {
                    connected = true;
                    emitChange();
                    return { accounts: [account] };
                },
            },
            'standard:disconnect': {
                version: '1.0.0',
                disconnect: async () => {
                    connected = false;
                    emitChange();
                },
            },
            'standard:events': {
                version: '1.0.0',
                on: (event: string, listener: ChangeListener) => {
                    if (event !== 'change') return () => {};
                    listeners.add(listener);
                    return () => listeners.delete(listener);
                },
            },
            'solana:signTransaction': {
                version: '1.0.0',
                supportedTransactionVersions: ['legacy', 0],
                signTransaction: async (...inputs: SignTransactionInput[]) => {
                    const outputs: { signedTransaction: Uint8Array }[] = [];
                    for (const input of inputs) {
                        assertDevnet(input.chain);
                        const transactions = input.transactions ?? (input.transaction ? [input.transaction] : []);
                        for (const transaction of transactions) {
                            outputs.push({ signedTransaction: await signWireTransaction(transaction) });
                        }
                    }
                    return outputs;
                },
            },
            'solana:signMessage': {
                version: '1.0.0',
                signMessage: async (...inputs: SignMessageInput[]) =>
                    Promise.all(
                        inputs.map(async ({ message }) => ({
                            signedMessage: message,
                            signature: new Uint8Array(await signBytes(keyPair.privateKey, message)),
                        })),
                    ),
            },
        },
    } satisfies Wallet;
}

// Init scripts also run on about:blank and other non-secure documents, where
// WebCrypto (and so signing) is unavailable. The app never runs there.
if (globalThis.isSecureContext && globalThis.crypto?.subtle) {
    createTestWallet().then(
        wallet => registerWallet(wallet),
        error => {
            // eslint-disable-next-line no-console
            console.error(`[${WALLET_NAME}] failed to initialise`, error);
        },
    );
}
