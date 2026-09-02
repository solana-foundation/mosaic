/**
 * Devnet end-to-end check for sRFC-37 list management (HOO-903).
 *
 * Creates a fresh Token-ACL blocklist token with DefaultAccountState=Initialized — the exact
 * configuration that used to break — then mints to a holder, blocklists it, and unblocklists it,
 * asserting the on-chain freeze state at every step.
 *
 * Not part of any automated suite: it needs devnet SOL and takes ~1 minute.
 *
 *   PAYER=<path-to-keypair.json> pnpm --filter @solana/mosaic-sdk exec \
 *     jest -c jest.devnet.config.js
 *
 * Omit PAYER to have a throwaway keypair generated and airdropped (devnet faucet permitting).
 */
import {
    airdropFactory,
    appendTransactionMessageInstructions,
    assertIsTransactionWithBlockhashLifetime,
    createDefaultRpcTransport,
    createKeyPairSignerFromBytes,
    createSolanaRpcFromTransport,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    generateKeyPairSigner,
    getSignatureFromTransaction,
    lamports,
    pipe,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    type Address,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { readFileSync } from 'node:fs';
import { createCustomTokenInitTransaction } from '../templates/custom-token.js';
import { getAddToBlocklistInstructions, getRemoveFromBlocklistInstructions } from '../management/blocklist.js';
import { getAddToAllowlistInstructions, getRemoveFromAllowlistInstructions } from '../management/allowlist.js';
import { createMintToTransaction } from '../management/mint.js';
import { getMintDetails, isDefaultAccountStateSetFrozen, resolveTokenAccount } from '../transaction-util.js';

const RPC_URL = process.env.DEVNET_RPC ?? 'https://api.devnet.solana.com';
const WS_URL = RPC_URL.replace('https', 'wss').replace('http', 'ws');

// The public devnet endpoint rate limits aggressively, and resolving Token-ACL extra account
// metas issues a burst of getAccountInfo calls. Retry 429s with exponential backoff so a shared
// endpoint doesn't masquerade as a test failure. Set DEVNET_RPC to a dedicated endpoint to skip
// most of this.
const innerTransport = createDefaultRpcTransport({ url: RPC_URL });
const transport: typeof innerTransport = async (...args) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 7; attempt++) {
        try {
            return await innerTransport(...args);
        } catch (error) {
            if (!/429|Too Many Requests/.test(String(error))) throw error;
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt));
        }
    }
    throw lastError;
};

const rpc = createSolanaRpcFromTransport(transport);
const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
const send = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

async function sendIx(instructions: Instruction[], payer: TransactionSigner<string>): Promise<string> {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(payer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    await send(signed, { commitment: 'confirmed' });
    return getSignatureFromTransaction(signed);
}

async function sendTx(tx: any): Promise<string> {
    const signed = await signTransactionMessageWithSigners(tx);
    assertIsTransactionWithBlockhashLifetime(signed);
    await send(signed, { commitment: 'confirmed' });
    return getSignatureFromTransaction(signed);
}

async function ataState(rpc: Rpc<SolanaRpcApi>, owner: Address, mint: Address) {
    const { tokenAccount, isInitialized, isFrozen, balance } = await resolveTokenAccount(rpc, owner, mint);
    return { tokenAccount, isInitialized, isFrozen, balance };
}

describe('devnet: sRFC-37 blocklist on a DefaultAccountState=Initialized mint', () => {
    let payer: TransactionSigner<string>;

    beforeAll(async () => {
        if (process.env.PAYER) {
            const bytes = new Uint8Array(JSON.parse(readFileSync(process.env.PAYER, 'utf8')));
            payer = await createKeyPairSignerFromBytes(bytes);
        } else {
            payer = await generateKeyPairSigner();
            console.log(`generated payer ${payer.address}`);
        }

        // Convenience only. The public faucet is frequently rate limited or dry, which is not a
        // reason to fail before we have even looked at the balance.
        const { value: before } = await rpc.getBalance(payer.address).send();
        if (Number(before) < 100_000_000) {
            try {
                console.log('requesting 1 SOL airdrop...');
                await airdropFactory({ rpc, rpcSubscriptions })({
                    recipientAddress: payer.address,
                    lamports: lamports(1_000_000_000n),
                    commitment: 'confirmed',
                });
            } catch (error) {
                console.log(`airdrop unavailable (${error instanceof Error ? error.message : error})`);
            }
        }

        const { value } = await rpc.getBalance(payer.address).send();
        console.log(`payer ${payer.address} balance ${Number(value) / 1e9} SOL`);
        if (Number(value) < 100_000_000) {
            throw new Error(
                `payer ${payer.address} has no devnet SOL.\n` +
                    `Fund that address (https://faucet.solana.com or a wallet transfer), or point PAYER at an\n` +
                    `already funded keypair:  PAYER=~/path/to/keypair.json pnpm --filter @solana/mosaic-sdk exec jest -c jest.devnet.config.js`,
            );
        }
    }, 120_000);

    test('blocklist add freezes, blocklist remove thaws', async () => {
        const mint = await generateKeyPairSigner();
        const holder = await generateKeyPairSigner();

        // 1. Create the token: Token-ACL blocklist, accounts born usable.
        const createTx = await createCustomTokenInitTransaction(
            rpc,
            'HOO-903 Check',
            'H903',
            6,
            'https://example.com/h903.json',
            payer, // mint authority
            mint,
            payer, // fee payer
            {
                enableMetadata: true,
                enableSrfc37: true,
                aclMode: 'blocklist',
                enableDefaultAccountState: true,
                defaultAccountStateInitialized: true, // <- the broken configuration
            },
        );
        console.log('create tx', await sendTx(createTx));
        console.log('mint', mint.address);

        // Precondition: this is exactly the shape that used to fail.
        const details = await getMintDetails(rpc, mint.address);
        expect(details.usesTokenAcl).toBe(true);
        expect(isDefaultAccountStateSetFrozen(details.extensions)).toBe(false);

        // 2. Mint to the holder so it has a real, unfrozen ATA.
        console.log(
            'mint-to tx',
            await sendTx(await createMintToTransaction(rpc, mint.address, holder.address, 100, payer, payer)),
        );
        let state = await ataState(rpc, holder.address, mint.address);
        expect(state.isInitialized).toBe(true);
        expect(state.isFrozen).toBe(false);
        expect(state.balance).toBe(100_000_000n);

        // 3. Blocklist the holder. This is the operation from the ticket.
        const addIx = await getAddToBlocklistInstructions(rpc, mint.address, holder.address, payer);
        console.log(
            'add-to-blocklist instructions:',
            addIx.map(i => i.programAddress),
        );
        expect(addIx).toHaveLength(2); // ABL addWallet + Token-ACL freeze
        console.log('blocklist add tx', await sendIx(addIx, payer));

        state = await ataState(rpc, holder.address, mint.address);
        expect(state.isFrozen).toBe(true); // <- the whole point

        // 4. Un-blocklist: wallet entry removed and the account thaws again.
        const removeIx = await getRemoveFromBlocklistInstructions(rpc, mint.address, holder.address, payer);
        console.log(
            'remove-from-blocklist instructions:',
            removeIx.map(i => i.programAddress),
        );
        console.log('blocklist remove tx', await sendIx(removeIx, payer));

        state = await ataState(rpc, holder.address, mint.address);
        expect(state.isFrozen).toBe(false);
    }, 600_000);

    // Covers the second bug fixed alongside HOO-903: removal from an allowlist used to freeze
    // only accounts that were ALREADY frozen, so it never actually revoked access.
    test('allowlist remove freezes, allowlist add thaws again', async () => {
        const mint = await generateKeyPairSigner();
        const holder = await generateKeyPairSigner();

        const createTx = await createCustomTokenInitTransaction(
            rpc,
            'HOO-903 Allow',
            'H903A',
            6,
            'https://example.com/h903a.json',
            payer,
            mint,
            payer,
            {
                enableMetadata: true,
                enableSrfc37: true,
                aclMode: 'allowlist',
                enableDefaultAccountState: true,
                defaultAccountStateInitialized: true, // what apps/app produces
            },
        );
        console.log('create tx', await sendTx(createTx));
        console.log('allowlist mint', mint.address);

        const details = await getMintDetails(rpc, mint.address);
        expect(details.usesTokenAcl).toBe(true);
        expect(isDefaultAccountStateSetFrozen(details.extensions)).toBe(false);

        console.log(
            'mint-to tx',
            await sendTx(await createMintToTransaction(rpc, mint.address, holder.address, 50, payer, payer)),
        );

        // Put the holder on the allowlist. Its account is already usable, so no thaw is
        // needed — the ABL entry alone.
        const addIx = await getAddToAllowlistInstructions(rpc, mint.address, holder.address, payer);
        console.log(
            'add-to-allowlist instructions:',
            addIx.map(i => i.programAddress),
        );
        console.log('allowlist add tx', await sendIx(addIx, payer));
        let state = await ataState(rpc, holder.address, mint.address);
        expect(state.isFrozen).toBe(false);

        // Remove from the allowlist: access must actually be revoked. Before the fix this
        // emitted the ABL removal only and left the account transacting.
        const removeIx = await getRemoveFromAllowlistInstructions(rpc, mint.address, holder.address, payer);
        console.log(
            'remove-from-allowlist instructions:',
            removeIx.map(i => i.programAddress),
        );
        expect(removeIx).toHaveLength(2); // ABL removeWallet + Token-ACL freeze
        console.log('allowlist remove tx', await sendIx(removeIx, payer));

        state = await ataState(rpc, holder.address, mint.address);
        expect(state.isFrozen).toBe(true); // <- the Change 2 assertion

        // Re-adding must restore access via permissionless thaw.
        const readdIx = await getAddToAllowlistInstructions(rpc, mint.address, holder.address, payer);
        console.log(
            're-add-to-allowlist instructions:',
            readdIx.map(i => i.programAddress),
        );
        expect(readdIx).toHaveLength(2); // ABL addWallet + Token-ACL thaw
        console.log('allowlist re-add tx', await sendIx(readdIx, payer));

        state = await ataState(rpc, holder.address, mint.address);
        expect(state.isFrozen).toBe(false);
    }, 600_000);
});
