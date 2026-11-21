// Devnet chain checks and fixtures for the agent-browser flows.
//
// The flows drive the UI; this script answers what the chain says afterwards,
// and sets up states the UI cannot reach. It signs with the same keypairs the
// test-wallet bundles embed.
//
// Usage: node e2e/agent-browser/chain.mjs <command> [options]   (prints JSON)
//
//   address  --role a|b|master                     the role's address
//   balance  --role a|b|master | --address A       SOL balance of the role (or of any address)
//   token    --role a|b --mint M [--owner A]       the role's (or <A>'s) token account:
//                                                  address, existence, raw balance, frozen
//   memos    --address A                           memos on the address's latest transactions
//   account-owner --address A                      the program that owns an account (null if none)
//   mint     --mint M                              the mint: existence, decimals, supply,
//                                                  authorities and every extension's fields
//   create-ata --role a --owner <address> --mint M create <owner>'s associated token
//                                                  account, paid by the role
//   fund     --role a --to <address> --sol 0.05    move SOL from the role to an address
//   new-address                                    a fresh address nobody holds a key for
//
// Roles: a, b and master, resolved by keypairs.mjs (the same keys the wallet
//        bundles embed); master is an optional faucet-funded wallet that run.sh
//        refills A from.
// RPC:   $SOLANA_RPC_URL, default public devnet. Devnet and localnet only.
//
// Suites extend this file rather than copy it: import `commands` and the
// helpers below, add commands, and call `runCli(commands)` (see a suite's
// chain-*.mjs). The CLI only runs when this file is executed directly; a suite
// file that is itself imported somewhere can guard its own with `isMain`.
/* global process, console, setTimeout, Buffer */
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
    address as toAddress,
    appendTransactionMessageInstructions,
    createKeyPairSignerFromBytes,
    createSolanaRpc,
    createTransactionMessage,
    generateKeyPairSigner,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    lamports,
    pipe,
    setTransactionMessageFeePayerSigner,
    unwrapOption,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import {
    AccountState,
    TOKEN_2022_PROGRAM_ADDRESS,
    fetchMaybeMint,
    fetchMaybeToken,
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
} from '@solana-program/token-2022';
import { keypairPath } from './keypairs.mjs';

export const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

export const rpc = createSolanaRpc(RPC_URL);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const json = value => JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
export { toAddress };

export function die(message) {
    console.error(`chain: ${message}`);
    process.exit(1);
}

/**
 * Whether the module at `metaUrl` is the script node was started with. Compares
 * real paths: `import.meta.url` is resolved through symlinks but argv[1] is
 * not, so a plain comparison is false whenever the checkout is reached through
 * a symlink, and the CLI would silently do nothing.
 */
export function isMain(metaUrl) {
    if (!process.argv[1]) return false;
    try {
        return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1]);
    } catch {
        return false;
    }
}

export async function signerFor(role) {
    let path;
    try {
        path = keypairPath(role);
    } catch (error) {
        die(error.message);
    }
    try {
        return await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path, 'utf8'))));
    } catch (error) {
        die(`could not read the ${role} keypair at ${path}: ${error.message}`);
    }
}

/** Retries an RPC call on public-devnet rate limits. */
export async function withBackoff(fn) {
    let delay = 500;
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const text = `${error?.message} ${error?.context?.__serverMessage ?? ''} ${error?.context?.statusCode ?? ''} ${error?.cause?.message ?? ''}`;
            if (attempt >= 7 || !/429|Too Many Requests/i.test(text)) throw error;
            await sleep(delay);
            delay = Math.min(delay * 2, 8000);
        }
    }
}

/** Signs a compiled message (lifetime already set), sends it, and polls until confirmed. */
export async function sendMessage(message) {
    const signed = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(signed);
    await withBackoff(() =>
        rpc.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: 'base64' }).send(),
    );
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const { value } = await withBackoff(() => rpc.getSignatureStatuses([signature]).send());
        const status = value[0];
        if (status?.err) die(`transaction ${signature} failed: ${json(status.err)}`);
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return signature;
        await sleep(1000);
    }
    die(`transaction ${signature} not confirmed within 60s`);
}

/** Builds a version-0 message from instructions with a fresh blockhash, then sends it. */
export async function send(feePayer, instructions) {
    const { value: blockhash } = await withBackoff(() => rpc.getLatestBlockhash().send());
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    );
    return sendMessage(message);
}

export async function ataFor(owner, mint) {
    const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
    return ata;
}

export async function solBalance(addr) {
    const { value } = await withBackoff(() => rpc.getBalance(addr, { commitment: 'confirmed' }).send());
    return Number(value) / 1e9;
}

/**
 * An owner's associated token account for a mint: { tokenAccount, exists, publicBalance?, frozen? }.
 * The owner is the role's address unless `owner` is given.
 */
export async function tokenState(role, mint, owner) {
    const ownerAddress = owner ? toAddress(owner) : (await signerFor(role)).address;
    const tokenAccount = await ataFor(ownerAddress, toAddress(mint));
    const token = await withBackoff(() => fetchMaybeToken(rpc, tokenAccount, { commitment: 'confirmed' }));
    return {
        owner: ownerAddress,
        tokenAccount,
        exists: token.exists,
        ...(token.exists ? { publicBalance: token.data.amount, frozen: token.data.state === AccountState.Frozen } : {}),
    };
}

/** Options become values or null, and kit's `{ __option }` wrappers inside extensions are unwrapped. */
function plain(value) {
    if (value && typeof value === 'object') {
        if ('__option' in value) return plain(unwrapOption(value));
        if (Array.isArray(value)) return value.map(plain);
        if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
    }
    return value;
}

/**
 * A mint as the flows assert on it: `extensions` is the list of extension kinds
 * (`TokenMetadata`, `PausableConfig`, ...) and `extension` maps each kind to its fields.
 */
export async function mintState(mint) {
    const account = await withBackoff(() => fetchMaybeMint(rpc, toAddress(mint), { commitment: 'confirmed' }));
    if (!account.exists) return { mint, exists: false };
    const { decimals, supply, mintAuthority, freezeAuthority, extensions } = account.data;
    const list = plain(extensions) ?? [];
    return {
        mint,
        exists: true,
        decimals,
        supply,
        mintAuthority: plain(mintAuthority),
        freezeAuthority: plain(freezeAuthority),
        extensions: list.map(e => e.__kind),
        extension: Object.fromEntries(list.map(({ __kind, ...fields }) => [__kind, fields])),
    };
}

export const commands = {
    async address({ role }) {
        return (await signerFor(role)).address;
    },

    async balance({ role, address }) {
        return solBalance(address ? toAddress(address) : (await signerFor(role)).address);
    },

    async token({ role, mint, owner }) {
        if (!mint) die('token needs --mint');
        return tokenState(role, mint, owner);
    },

    async memos({ address }) {
        if (!address) die('memos needs --address');
        const list = await withBackoff(() =>
            rpc.getSignaturesForAddress(toAddress(address), { limit: 10, commitment: 'confirmed' }).send(),
        );
        return list.map(s => s.memo).filter(Boolean);
    },

    async 'account-owner'({ address }) {
        if (!address) die('account-owner needs --address');
        const { value } = await withBackoff(() =>
            rpc.getAccountInfo(toAddress(address), { encoding: 'base64', commitment: 'confirmed' }).send(),
        );
        return value?.owner ?? 'null';
    },

    async mint({ mint }) {
        if (!mint) die('mint needs --mint');
        return mintState(mint);
    },

    async 'create-ata'({ role, owner, mint }) {
        if (!owner || !mint) die('create-ata needs --owner and --mint');
        const payer = await signerFor(role);
        const ata = await ataFor(toAddress(owner), toAddress(mint));
        const signature = await send(payer, [
            getCreateAssociatedTokenIdempotentInstruction({
                payer,
                owner: toAddress(owner),
                mint: toAddress(mint),
                ata,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            }),
        ]);
        return { tokenAccount: ata, signature };
    },

    async fund({ role, to, sol }) {
        if (!to || !sol) die('fund needs --to and --sol');
        const source = await signerFor(role);
        const signature = await send(source, [
            getTransferSolInstruction({
                source,
                destination: toAddress(to),
                amount: lamports(BigInt(Math.round(Number(sol) * 1e9))),
            }),
        ]);
        return { signature };
    },

    async 'new-address'() {
        return (await generateKeyPairSigner()).address;
    },
};

/** Options every command can take; suites pass extra ones to `runCli`. */
export const OPTIONS = {
    role: { type: 'string', default: 'a' },
    mint: { type: 'string' },
    owner: { type: 'string' },
    address: { type: 'string' },
    to: { type: 'string' },
    sol: { type: 'string' },
};

/** Parses argv, runs the command, prints its result as JSON (or a bare string). */
export async function runCli(table, extraOptions = {}) {
    const [command, ...rest] = process.argv.slice(2);
    if (!table[command]) die(`unknown command '${command ?? ''}'; commands: ${Object.keys(table).join(', ')}`);
    if (!/devnet|127\.0\.0\.1|localhost/.test(RPC_URL)) die(`refusing to run against ${RPC_URL}: devnet only`);
    const { values } = parseArgs({ args: rest, options: { ...OPTIONS, ...extraOptions } });
    const result = await table[command](values);
    console.log(typeof result === 'string' ? result : json(result));
}

if (isMain(import.meta.url)) {
    await runCli(commands);
}
