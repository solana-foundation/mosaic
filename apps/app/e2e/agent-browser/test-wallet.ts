// Devnet-only Wallet Standard wallet for browser-driven UI testing.
//
// Bundled by `build-test-wallet.mjs` into an IIFE and loaded with
// `agent-browser --init-script`, so it registers before the app's own scripts
// run. `@solana/connector` discovers it through the Wallet Standard registry
// like any extension wallet, and it shows up in the wallet modal as
// "Mosaic Test Wallet".
//
// It signs everything it is asked to without prompting. That is only acceptable
// because it holds throwaway devnet test keys and refuses any chain other than
// `solana:devnet`.
//
// The secret keys are never in this file: the build injects them through the
// `__MOSAIC_TEST_*__` defines, and the bundle is written to the gitignored
// `apps/app/.agent-browser/` directory.
//
// Flows drive failure modes through `window.__mosaicTestWallet` (see
// `TestWalletControl`): refusing the key-derivation message, rejecting the Nth
// transaction, stalling a signature, disconnecting or switching accounts. Every
// sign request is counted, so a flow can assert that an invalid input never
// reached the wallet.

import {
    type Address,
    createKeyPairFromBytes,
    getBase58Decoder,
    getTransactionDecoder,
    getTransactionEncoder,
    partiallySignTransaction,
    signBytes,
} from '@solana/kit';
import { registerWallet, type Wallet, type WalletAccount } from '@wallet-standard/core';

declare const __MOSAIC_TEST_SECRET_KEY__: number[];
/** Second keypair for `switchAccount()`, or null when the build was given none. */
declare const __MOSAIC_TEST_ALT_SECRET_KEY__: number[] | null;
/** False builds a wallet without `solana:signMessage`, like a wallet that cannot sign messages at all. */
declare const __MOSAIC_TEST_SIGN_MESSAGE__: boolean;
/** Advertising `1` makes the app plan confidential operations as SIMD-0385 v1 transactions. */
declare const __MOSAIC_TEST_TX_VERSIONS__: ('legacy' | 0 | 1)[];

const WALLET_NAME = 'Mosaic Test Wallet';
const DEVNET = 'solana:devnet';
const CHAINS = [DEVNET] as const;

/** What Phantom says when asked to sign the derivation message (HOO-1423). */
const PHANTOM_REFUSAL = 'You cannot sign solana transactions using sign message';
/** A rejection the SDK's `isSignerRejection` recognises: EIP-1193 code 4001. */
const USER_REJECTION = 'User rejected the request.';

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
    // first tries a non-standard `transactions: [...]` shape and falls back to
    // the standard one on *any* error, user rejections included. Real wallets
    // only implement the standard shape, so the first call fails before any
    // prompt; this wallet refuses it the same way, or a simulated rejection
    // would be swallowed by the fallback and the transaction signed anyway.
    transaction?: Uint8Array;
    transactions?: Uint8Array[];
}

interface SignMessageInput {
    account: WalletAccount;
    message: Uint8Array;
}

type ChangeListener = (properties: { accounts?: readonly WalletAccount[] }) => void;

/** One sign request, booked when it arrived. */
interface SignRecord {
    kind: 'signTransaction' | 'signMessage';
    /** 1-based number of this request among its kind since the page loaded (or the last `reset()`). */
    n: number;
    /**
     * `rejected`: `rejectSignTransaction()` turned it down as the user would.
     * `refused`: the wallet would not sign it (another chain, an account that
     * is not connected, `refuseSignMessage()`, unreadable bytes).
     */
    outcome: 'signed' | 'rejected' | 'refused';
    /** The account the app asked to sign with, `(none)` if it named none. */
    account: string;
}

/** The control surface flows reach through `agent-browser eval`. */
export interface TestWalletControl {
    readonly address: string;
    readonly connected: boolean;
    /**
     * Sign requests received, by kind, including the ones the wallet refused or
     * rejected. Transactions count one per transaction, not per call. The
     * connector's non-standard first call (see `SignTransactionInput`) is not a
     * request and is not counted.
     */
    readonly counts: { signTransaction: number; signMessage: number };
    /** One entry per counted request, in the order they finished. */
    readonly log: readonly SignRecord[];
    /** What the most recent sign request threw, or null once one is signed. */
    readonly lastError: string | null;
    /** Make every `signMessage` throw `message` (Phantom's refusal by default); `null` restores signing. */
    refuseSignMessage(message?: string | null): void;
    /**
     * Reject the `n`th transaction request from now on (1 = the next one) as a
     * user rejection, code 4001. Pass a message to throw a plain error instead.
     */
    rejectSignTransaction(n: number, message?: string): void;
    /** Hold every signature for `ms` before returning it, e.g. to outlive a blockhash. */
    delaySignMs(ms: number): void;
    /** Disconnect from the wallet side, as if the user did it in the extension. */
    disconnect(): void;
    /** Swap to the other keypair, as if the user switched accounts in the extension. */
    switchAccount(): string;
    /** Clear counters, the log and every failure mode. */
    reset(): void;
}

declare global {
    interface Window {
        __mosaicTestWallet?: TestWalletControl;
    }
}

function assertDevnet(chain: string | undefined): void {
    if (chain !== DEVNET) {
        throw new Error(
            `${WALLET_NAME} only signs for ${DEVNET}; the app asked for ${chain ?? 'an unspecified chain'}. ` +
                'Switch the app to Devnet.',
        );
    }
}

function userRejection(): Error {
    return Object.assign(new Error(USER_REJECTION), { code: 4001 });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type KeyPair = Awaited<ReturnType<typeof createKeyPairFromBytes>>;

interface Identity {
    /** Imported on first use: WebCrypto is async, and registration must not wait for it. */
    keyPair: () => Promise<KeyPair>;
    account: WalletAccount;
}

function createIdentity(secretKey: number[], features: readonly `${string}:${string}`[]): Identity {
    // A Solana CLI keypair file is the 32-byte seed followed by the 32-byte
    // public key, so the address is known without touching WebCrypto.
    const publicKey = new Uint8Array(secretKey.slice(32));
    const address = getBase58Decoder().decode(publicKey) as Address;
    let keyPair: Promise<KeyPair> | undefined;
    return {
        keyPair: () => (keyPair ??= createKeyPairFromBytes(new Uint8Array(secretKey))),
        account: { address, publicKey, chains: CHAINS, features, label: WALLET_NAME },
    };
}

/**
 * Builds the wallet synchronously, so the init script registers it before the
 * app's connector boots. Registering after an `await` loses that race on some
 * loads, and the connector's auto-connect then finds no wallet and gives up.
 */
function createTestWallet(): { wallet: Wallet; control: TestWalletControl } {
    const canSignMessage = __MOSAIC_TEST_SIGN_MESSAGE__;
    const accountFeatures = canSignMessage
        ? (['solana:signTransaction', 'solana:signMessage'] as const)
        : (['solana:signTransaction'] as const);

    const identities = [createIdentity(__MOSAIC_TEST_SECRET_KEY__, accountFeatures)];
    if (__MOSAIC_TEST_ALT_SECRET_KEY__) {
        identities.push(createIdentity(__MOSAIC_TEST_ALT_SECRET_KEY__, accountFeatures));
    }
    let active = 0;
    const current = () => identities[active];

    let connected = false;
    const listeners = new Set<ChangeListener>();
    const emitChange = () => {
        for (const listener of listeners) listener({ accounts: connected ? [current().account] : [] });
    };

    // Failure modes and bookkeeping, all driven from `control`.
    let counts = { signTransaction: 0, signMessage: 0 };
    let log: SignRecord[] = [];
    let messageRefusal: string | null = null;
    let rejectTransactionAt: { n: number; message?: string } | null = null;
    let delayMs = 0;
    let lastError: string | null = null;
    /** Errors that stand for the user rejecting a request: logged as `rejected`, not `refused`. */
    const rejections = new WeakSet<object>();

    /**
     * Books a sign request the moment it arrives. Its count, its number and the
     * account it was made for are fixed here, before `run` awaits anything, so
     * overlapping requests and a `switchAccount()` while one is pending cannot
     * change them. The outcome is then logged against that booking, and
     * `lastError` follows the most recent request.
     */
    const handle = <T>(
        kind: SignRecord['kind'],
        account: WalletAccount | undefined,
        run: (n: number) => Promise<T>,
    ): Promise<T> => {
        counts[kind] += 1;
        const booking = { kind, n: counts[kind], account: account?.address ?? '(none)' };
        return run(booking.n).then(
            value => {
                log.push({ ...booking, outcome: 'signed' });
                lastError = null;
                return value;
            },
            (error: unknown) => {
                const rejected = typeof error === 'object' && error !== null && rejections.has(error);
                log.push({ ...booking, outcome: rejected ? 'rejected' : 'refused' });
                lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
                throw error;
            },
        );
    };

    const identityFor = (account: WalletAccount | undefined): Identity => {
        const identity = identities.find(i => i.account.address === account?.address);
        if (!identity || identity !== current() || !connected) {
            throw new Error(`${WALLET_NAME}: account ${account?.address ?? '(none)'} is not connected.`);
        }
        return identity;
    };

    const decoder = getTransactionDecoder();
    const encoder = getTransactionEncoder();
    const signWireTransaction = (input: SignTransactionInput & { transaction: Uint8Array }): Promise<Uint8Array> =>
        handle('signTransaction', input.account, async n => {
            if (rejectTransactionAt && n === rejectTransactionAt.n) {
                const { message } = rejectTransactionAt;
                rejectTransactionAt = null;
                const error = message ? new Error(message) : userRejection();
                rejections.add(error);
                throw error;
            }
            assertDevnet(input.chain);
            const identity = identityFor(input.account);
            if (delayMs > 0) await sleep(delayMs);
            const signed = await partiallySignTransaction(
                [await identity.keyPair()],
                decoder.decode(input.transaction),
            );
            return new Uint8Array(encoder.encode(signed));
        });

    // Mutable while it is assembled; `Wallet['features']` is a readonly record.
    const features: Record<`${string}:${string}`, unknown> = {
        'standard:connect': {
            version: '1.0.0',
            connect: async () => {
                connected = true;
                emitChange();
                return { accounts: [current().account] };
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
            supportedTransactionVersions: __MOSAIC_TEST_TX_VERSIONS__,
            signTransaction: async (...inputs: SignTransactionInput[]) => {
                // Refused before anything is booked: the connector's non-standard
                // first call (see SignTransactionInput) is not a sign request.
                if (inputs.some(input => !input.transaction)) {
                    throw new Error(`${WALLET_NAME}: expected the Wallet Standard \`transaction\` input`);
                }
                const outputs: { signedTransaction: Uint8Array }[] = [];
                for (const input of inputs as (SignTransactionInput & { transaction: Uint8Array })[]) {
                    outputs.push({ signedTransaction: await signWireTransaction(input) });
                }
                return outputs;
            },
        },
    };

    if (canSignMessage) {
        features['solana:signMessage'] = {
            version: '1.0.0',
            signMessage: async (...inputs: SignMessageInput[]) => {
                const outputs: { signedMessage: Uint8Array; signature: Uint8Array }[] = [];
                for (const { account, message } of inputs) {
                    const output = await handle('signMessage', account, async () => {
                        if (messageRefusal !== null) throw new Error(messageRefusal);
                        const identity = identityFor(account);
                        if (delayMs > 0) await sleep(delayMs);
                        // Raw bytes, unprefixed and unhashed: anything else would derive
                        // different confidential keys than the SDK and CLI do.
                        const signature = new Uint8Array(
                            await signBytes((await identity.keyPair()).privateKey, message),
                        );
                        return { signedMessage: message, signature };
                    });
                    outputs.push(output);
                }
                return outputs;
            },
        };
    }

    const wallet: Wallet = {
        version: '1.0.0',
        name: WALLET_NAME,
        icon: ICON,
        chains: CHAINS,
        get accounts() {
            return connected ? [current().account] : [];
        },
        features,
    };

    const control: TestWalletControl = {
        get address() {
            return current().account.address;
        },
        get connected() {
            return connected;
        },
        get counts() {
            return { ...counts };
        },
        get log() {
            return [...log];
        },
        get lastError() {
            return lastError;
        },
        refuseSignMessage(message: string | null = PHANTOM_REFUSAL) {
            messageRefusal = message;
        },
        rejectSignTransaction(n: number, message?: string) {
            if (!Number.isInteger(n) || n < 1) throw new Error('rejectSignTransaction: n must be a positive integer');
            rejectTransactionAt = { n: counts.signTransaction + n, message };
        },
        delaySignMs(ms: number) {
            delayMs = Math.max(0, ms);
        },
        disconnect() {
            connected = false;
            emitChange();
        },
        switchAccount() {
            if (identities.length < 2) throw new Error('switchAccount: the bundle was built without an alt keypair');
            active = (active + 1) % identities.length;
            emitChange();
            return current().account.address;
        },
        reset() {
            counts = { signTransaction: 0, signMessage: 0 };
            log = [];
            messageRefusal = null;
            rejectTransactionAt = null;
            delayMs = 0;
            lastError = null;
        },
    };

    return { wallet, control };
}

// Init scripts also run on about:blank and other non-secure documents, where
// WebCrypto (and so signing) is unavailable. The app never runs there.
if (globalThis.isSecureContext && globalThis.crypto?.subtle) {
    try {
        const { wallet, control } = createTestWallet();
        window.__mosaicTestWallet = control;
        registerWallet(wallet);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[${WALLET_NAME}] failed to initialise`, error);
    }
}
