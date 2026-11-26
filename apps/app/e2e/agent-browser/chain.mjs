// Devnet chain checks and fixtures for the agent-browser flows.
//
// The flows drive the UI; this script answers what the chain says afterwards,
// and sets up states the UI cannot reach. It signs with the same keypairs the
// test-wallet bundles embed.
//
// Usage: node e2e/agent-browser/chain.mjs <command> [options]   (prints JSON)
//
//   address  --role a|b|master                     the role's address
//   balance  --role a|b|master                     SOL balance
//   mint     --mint M                              the mint: existence, decimals, raw supply
//   token    --role a|b --mint M                   the role's token account: address,
//                                                  existence, raw public balance
//   create-ata --role a --owner <address> --mint M create <owner>'s associated token
//                                                  account, paid by the role
//   fund     --role a --to <address> --sol 0.05    move SOL from the role to an address
//   new-address                                    a fresh address nobody holds a key for
//
// Roles: a, b and master, resolved by keypairs.mjs (the same keys the wallet
//        bundles embed); master is an optional faucet-funded wallet that run.sh
//        refills A from.
// RPC:   $SOLANA_RPC_URL, default public devnet. Devnet and localnet only: the
//        host must be loopback or carry a `devnet` label (isDevnetRpcUrl), and
//        anything that signs first checks a remote endpoint's genesis hash.
//
// Suites extend this file rather than copy it: import `commands` and the
// helpers below, add commands, and call `runCli(commands)` (see a suite's
// chain-*.mjs). The CLI only runs when this file is executed directly; a suite
// file that is itself imported somewhere can guard its own with `isMain`.
/* global process, console, setTimeout */
import { realpathSync } from 'node:fs';
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
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    fetchMaybeMint,
    fetchMaybeToken,
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
} from '@solana-program/token-2022';
import { keypairPath, readKeypairFile } from './keypairs.mjs';

export const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

export const rpc = createSolanaRpc(RPC_URL);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const json = value => JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
export { toAddress };

const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const hostnameOf = url => {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
};
const isLoopback = url => LOOPBACK_HOSTS.has(hostnameOf(url));

/**
 * Whether an RPC URL is one this harness may sign against: a loopback host
 * (localnet), or a host name with a `devnet` label, such as
 * api.devnet.solana.com, devnet.helius-rpc.com or solana-devnet.g.alchemy.com.
 * Only the host counts: `?cluster=devnet` or `localhost.example.com` do not.
 */
export function isDevnetRpcUrl(url) {
    const hostname = hostnameOf(url);
    if (!hostname) return false;
    return LOOPBACK_HOSTS.has(hostname) || hostname.split(/[.-]/).includes('devnet');
}

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
        return await createKeyPairSignerFromBytes(new Uint8Array(readKeypairFile(path)));
    } catch (error) {
        die(`could not read the ${role} keypair: ${error.message}`);
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

let genesisChecked;
/**
 * Refuses to sign against a remote endpoint that is not devnet, whatever its
 * host name says. Loopback is localnet, whose genesis differs per validator.
 */
function assertDevnetGenesis() {
    if (isLoopback(RPC_URL)) return Promise.resolve();
    genesisChecked ??= withBackoff(() => rpc.getGenesisHash().send()).then(hash => {
        if (hash !== DEVNET_GENESIS_HASH)
            die(`refusing to sign against ${RPC_URL}: its genesis hash ${hash} is not devnet's`);
    });
    return genesisChecked;
}

/** Signs a compiled message (lifetime already set), sends it, and polls until confirmed. */
export async function sendMessage(message) {
    await assertDevnetGenesis();
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

/** A mint: { exists, decimals?, supply? } (supply in raw units). */
export async function mintState(mint) {
    const account = await withBackoff(() => fetchMaybeMint(rpc, toAddress(mint), { commitment: 'confirmed' }));
    return {
        mint,
        exists: account.exists,
        ...(account.exists ? { decimals: account.data.decimals, supply: account.data.supply } : {}),
    };
}

/** The role's associated token account for a mint: { tokenAccount, exists, publicBalance? }. */
export async function tokenState(role, mint) {
    const signer = await signerFor(role);
    const tokenAccount = await ataFor(signer.address, toAddress(mint));
    const token = await withBackoff(() => fetchMaybeToken(rpc, tokenAccount, { commitment: 'confirmed' }));
    return {
        owner: signer.address,
        tokenAccount,
        exists: token.exists,
        ...(token.exists ? { publicBalance: token.data.amount } : {}),
    };
}

export const commands = {
    async address({ role }) {
        return (await signerFor(role)).address;
    },

    async balance({ role }) {
        return solBalance((await signerFor(role)).address);
    },

    async mint({ mint }) {
        if (!mint) die('mint needs --mint');
        return mintState(mint);
    },

    async token({ role, mint }) {
        if (!mint) die('token needs --mint');
        return tokenState(role, mint);
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
    to: { type: 'string' },
    sol: { type: 'string' },
};

/** Parses argv, runs the command, prints its result as JSON (or a bare string). */
export async function runCli(table, extraOptions = {}) {
    const [command, ...rest] = process.argv.slice(2);
    if (!table[command]) die(`unknown command '${command ?? ''}'; commands: ${Object.keys(table).join(', ')}`);
    if (!isDevnetRpcUrl(RPC_URL)) die(`refusing to run against ${RPC_URL}: devnet or localnet only`);
    const { values } = parseArgs({ args: rest, options: { ...OPTIONS, ...extraOptions } });
    const result = await table[command](values);
    console.log(typeof result === 'string' ? result : json(result));
}

if (isMain(import.meta.url)) {
    await runCli(commands);
}
