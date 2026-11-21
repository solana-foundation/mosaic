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
//   token    --role a|b --mint M                   the role's token account: address,
//                                                  existence, raw public balance
//   create-ata --role a --owner <address> --mint M create <owner>'s associated token
//                                                  account, paid by the role
//   fund     --role a --to <address> --sol 0.05    move SOL from the role to an address
//   new-address                                    a fresh address nobody holds a key for
//
// Roles: a = $MOSAIC_TEST_KEYPAIR_A (default ~/.config/solana/mosaic-e2e-a.json),
//        b = $MOSAIC_TEST_KEYPAIR_B (default ~/.config/solana/mosaic-e2e-b.json),
//        master = $MOSAIC_TEST_KEYPAIR_MASTER (default ~/.config/solana/mosaic-e2e-master.json),
//        an optional faucet-funded wallet that run.sh refills A from.
// RPC:   $SOLANA_RPC_URL, default public devnet. Devnet and localnet only.
//
// Suites extend this file rather than copy it: import `commands` and the
// helpers below, add commands, and call `runCli(commands)` (see a suite's
// chain-*.mjs). The CLI only runs when this file is executed directly.
/* global process, console, setTimeout */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
    fetchMaybeToken,
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
} from '@solana-program/token-2022';

export const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const KEYPAIRS = {
    a: process.env.MOSAIC_TEST_KEYPAIR_A ?? join(homedir(), '.config/solana/mosaic-e2e-a.json'),
    b: process.env.MOSAIC_TEST_KEYPAIR_B ?? join(homedir(), '.config/solana/mosaic-e2e-b.json'),
    master: process.env.MOSAIC_TEST_KEYPAIR_MASTER ?? join(homedir(), '.config/solana/mosaic-e2e-master.json'),
};

export const rpc = createSolanaRpc(RPC_URL);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const json = value => JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
export { toAddress };

export function die(message) {
    console.error(`chain: ${message}`);
    process.exit(1);
}

export async function signerFor(role) {
    const path = KEYPAIRS[role];
    if (!path) die(`unknown role '${role}' (expected a, b or master)`);
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
    if (!/devnet|127\.0\.0\.1|localhost/.test(RPC_URL)) die(`refusing to run against ${RPC_URL}: devnet only`);
    const { values } = parseArgs({ args: rest, options: { ...OPTIONS, ...extraOptions } });
    const result = await table[command](values);
    console.log(typeof result === 'string' ? result : json(result));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await runCli(commands);
}
