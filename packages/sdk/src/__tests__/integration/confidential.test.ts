import {
    type Address,
    type InstructionPlan,
    type KeyPairSigner,
    type Rpc,
    type SolanaRpcApi,
    type SolanaRpcApiMainnet,
    type TransactionPlan,
    type TransactionSigner,
    type Signature,
    createKeyPairSignerFromBytes,
    createSolanaRpc,
    generateKeyPairSigner,
    flattenTransactionPlan,
    getAddressDecoder,
    getBase58Encoder,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    getTransactionMessageSize,
    getTransactionMessageSizeLimit,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    singleInstructionPlan,
} from '@solana/kit';
import {
    fetchMint,
    fetchToken,
    findAssociatedTokenPda,
    getMintToInstruction,
    getSetTransferFeeInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { Token } from '../../issuance/index.js';
import {
    createApplyConfidentialPendingBalanceInstructionPlan,
    createConfidentialDepositInstructionPlan,
    createConfidentialTransferInstructionPlan,
    createConfidentialWithdrawInstructionPlan,
    createConfigureConfidentialAccountInstructionPlan,
    createEmptyConfidentialAccountInstructionPlan,
    decryptElGamalBalance,
    deriveConfidentialKeys,
    estimateAndSetConfidentialResourceLimits,
    freeConfidentialKeys,
    inspectConfidentialAccount,
    planConfidentialInstructions,
    type ConfidentialKeys,
    type ConfidentialTransactionVersion,
} from '../../confidential/index.js';
import type { FullTransaction } from '../../transaction-util.js';
import type { Client } from './setup.js';
import { airdropAndWait } from './chain-helpers.js';
import { describeSkipIf } from './helpers.js';

/**
 * Real end-to-end confidential-transfer run against a live cluster (devnet by
 * default — the ZK ElGamal Proof Program is enabled there). Opt-in: it only runs
 * when `RUN_CONFIDENTIAL_E2E=1`, so the default unit/CI run stays offline.
 *
 *   RUN_CONFIDENTIAL_E2E=1 pnpm --filter @solana/mosaic-sdk exec jest confidential.test
 *
 * Config (env):
 *   SOLANA_RPC_URL            RPC endpoint (default https://api.devnet.solana.com)
 *   CONFIDENTIAL_PAYER_SECRET The (pre-funded) payer secret key, in either of:
 *                               - a JSON array of 64 bytes (Solana CLI `id.json`), or
 *                               - a base58 string (Phantom "Show Private Key" export).
 *                             If set, it is used instead of generating a payer and
 *                             requesting a devnet airdrop (which is rate-limited).
 *                             ⚠️ A Phantom key is shared across mainnet/devnet — prefer
 *                             a throwaway `solana-keygen` keypair for testing.
 *   CONFIDENTIAL_TX_VERSION   Transaction format to plan into: `0` (default) or `1`
 *                             (SIMD-0385, 4096-byte messages). At `1` the send path
 *                             also simulates each transaction to replace the planner's
 *                             provisory resource limits, which version 1 requires.
 *                             Needs an Agave ≥ 4.2.2 RPC; devnet qualifies.
 *
 * Every plan logs its transaction count and each message's size against the
 * version's limit, so the two versions can be compared run to run.
 */
const RUN = process.env.RUN_CONFIDENTIAL_E2E === '1';
const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const TX_VERSION: ConfidentialTransactionVersion = process.env.CONFIDENTIAL_TX_VERSION === '1' ? 1 : 0;
const ZK_PROOF_PROGRAM = 'ZkE1Gama1Proof11111111111111111111111111111' as Address;

const DECIMALS = 2;
const MINT_AMOUNT = 1_000n; // 10.00 tokens, minted to the sender's plaintext balance
const TRANSFER_AMOUNT = 400n; // 4.00 tokens, sent confidentially

// Fee-mint run: 1% of 400 is exactly 4, under the cap. The raised schedule
// (5%, capped at 7) would charge 7 instead, so a proof built against it fails.
const FEE_BASIS_POINTS = 100;
const MAXIMUM_FEE = 1_000n;
const EXPECTED_FEE = 4n;
const RAISED_FEE_BASIS_POINTS = 500;
const RAISED_MAXIMUM_FEE = 7n;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Maps an RPC URL to a Solana Explorer `cluster` query param. */
function clusterParam(rpcUrl: string): string {
    if (/devnet/.test(rpcUrl)) return 'devnet';
    if (/testnet/.test(rpcUrl)) return 'testnet';
    if (/localhost|127\.0\.0\.1/.test(rpcUrl)) return 'custom&customUrl=' + encodeURIComponent(rpcUrl);
    return 'mainnet-beta';
}

interface Artefacts {
    /** Short name of the flow this run covers; keeps the two runs' files apart. */
    run: string;
    cluster: string;
    mint: Address;
    payer: Address;
    recipient: Address;
    senderAta: Address;
    recipientAta: Address;
    transactions: Array<{ step: string; signature: string }>;
}

/**
 * Where a run's artefacts JSON goes. The base path (overridable via
 * CONFIDENTIAL_ARTEFACTS_PATH) gets the run name spliced in before its
 * extension, so the two flows land in separate files instead of the second
 * clobbering the first.
 */
function artefactsPath(run: string): string {
    const base = process.env.CONFIDENTIAL_ARTEFACTS_PATH ?? join(tmpdir(), 'confidential-e2e-artefacts.json');
    const ext = extname(base);
    return join(dirname(base), `${basename(base, ext)}.${run}${ext}`);
}

/**
 * Prints Solana Explorer links for every account + transaction in the run and
 * writes them to a JSON file (path overridable via CONFIDENTIAL_ARTEFACTS_PATH)
 * so the on-chain activity is easy to inspect afterwards.
 */
function emitArtefacts(a: Artefacts): void {
    const tx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${a.cluster}`;
    const acct = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=${a.cluster}`;
    const lines = [
        '',
        `═══════════ confidential e2e artefacts — ${a.run} ═══════════`,
        `mint          ${acct(a.mint)}`,
        `payer         ${acct(a.payer)}`,
        `recipient     ${acct(a.recipient)}`,
        `sender ATA    ${acct(a.senderAta)}`,
        `recipient ATA ${acct(a.recipientAta)}`,
        '— transactions —',
        ...a.transactions.map(t => `${t.step.padEnd(24)} ${tx(t.signature)}`),
        '═══════════════════════════════════════════════════════════',
        '',
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    const path = artefactsPath(a.run);
    writeFileSync(path, JSON.stringify(a, null, 2));
    // eslint-disable-next-line no-console
    console.log(`artefacts written to ${path}\n`);
}

/**
 * Runs an RPC call, retrying on HTTP 429 with exponential backoff. The public
 * devnet endpoint rate-limits this flow's many sequential calls, so every RPC
 * read/send goes through here.
 */
async function withBackoff<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let delay = 500;
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const msg = (err as Error).message ?? '';
            if (!/429|Too Many Requests/i.test(msg)) throw err;
            await sleep(delay);
            delay = Math.min(delay * 2, 8_000);
        }
    }
    throw new Error(`${label}: exhausted retries after repeated 429s`);
}

// Transient public-devnet conditions: rate limits, load-balanced nodes lagging
// behind the latest state, dropped txs / expired blockhashes. All are safe to
// retry with a fresh blockhash (each op's instructions are idempotent enough at
// our granularity, and the SDK txs are valid — verified by simulation).
const TRANSIENT =
    /429|Too Many Requests|debit an account|could not find|IncorrectProgramId|Blockhash(NotFound)?|block height exceeded|not confirmed|BlockhashNotFound/i;

/** Sign with a fresh blockhash, send (preflight on), and confirm — retrying on transient errors. */
async function signSendConfirm(rpc: Rpc<SolanaRpcApi>, baseMessage: unknown): Promise<Signature> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            const { value: bh } = await withBackoff('getLatestBlockhash', () => rpc.getLatestBlockhash().send());
            const withLifetime = setTransactionMessageLifetimeUsingBlockhash(
                bh,
                baseMessage as Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[1],
            );
            // Version 1 carries its resource limits in header fields that default
            // to zero, so the planner's provisory values must be replaced with
            // simulated ones before signing — per transaction, here rather than
            // up front, because later transactions read context-state accounts
            // that earlier ones in the same plan create.
            const message =
                TX_VERSION === 1
                    ? await withBackoff('estimateResourceLimits', () =>
                          estimateAndSetConfidentialResourceLimits({
                              rpc: rpc as Parameters<typeof estimateAndSetConfidentialResourceLimits>[0]['rpc'],
                              transactionMessage: withLifetime as FullTransaction,
                          }),
                      )
                    : withLifetime;
            const signed = await signTransactionMessageWithSigners(message as FullTransaction);
            const signature = getSignatureFromTransaction(signed);
            const wire = getBase64EncodedWireTransaction(signed);
            // skipPreflight: true is the normal default and avoids spurious preflight
            // failures on lagging public-RPC nodes; execution errors still surface via
            // getSignatureStatuses (entry.err) below.
            await withBackoff('sendTransaction', () =>
                rpc.sendTransaction(wire, { encoding: 'base64', skipPreflight: true }).send(),
            );
            const deadline = Date.now() + 45_000;
            while (Date.now() < deadline) {
                const status = await withBackoff('getSignatureStatuses', () =>
                    rpc.getSignatureStatuses([signature]).send(),
                );
                const entry = status.value[0];
                if (entry?.err)
                    throw new Error(
                        `Transaction ${signature} failed: ${JSON.stringify(entry.err, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
                    );
                if (entry?.confirmationStatus === 'confirmed' || entry?.confirmationStatus === 'finalized')
                    return signature;
                await sleep(1_000);
            }
            throw new Error(`Transaction ${signature} not confirmed within 45s`);
        } catch (err) {
            lastErr = err;
            if (!TRANSIENT.test((err as Error).message ?? '')) throw err;
            await sleep(2_000); // let lagging nodes catch up, then retry with a fresh blockhash
        }
    }
    throw lastErr;
}

/** Polls until a token account exists and is owned by Token-2022 (avoids cross-node lag). */
async function waitForToken2022Account(rpc: Rpc<SolanaRpcApi>, account: Address): Promise<void> {
    for (let i = 0; i < 30; i++) {
        const info = await withBackoff('getAccountInfo', () =>
            rpc.getAccountInfo(account, { encoding: 'base64', commitment: 'confirmed' }).send(),
        );
        if (info.value?.owner === TOKEN_2022_PROGRAM_ADDRESS) return;
        await sleep(1_000);
    }
    throw new Error(`Account ${account} not visible as a Token-2022 account in time`);
}

/**
 * Logs how many transactions a plan needs and how big each message is against
 * the version's size limit. This is the measurement that decides whether a
 * version-1 plan is actually cheaper (fewer signatures, fewer round trips,
 * less context-state rent churn) than the version-0 one it replaces.
 */
function logPlanShape(step: string, plan: TransactionPlan): void {
    const messages = flattenTransactionPlan(plan).map(p => p.message);
    const sizes = messages.map(m => `${getTransactionMessageSize(m)}/${getTransactionMessageSizeLimit(m)}`);
    console.log(`  plan[v${TX_VERSION}] ${step}: ${messages.length} tx — ${sizes.join(', ')} bytes`);
}

/** Walks a TransactionPlan, sending each transaction (in order); returns all signatures. */
async function runPlan(
    client: Client,
    feePayer: TransactionSigner,
    instructionPlan: InstructionPlan,
    step = 'plan',
): Promise<Signature[]> {
    const plan = await planConfidentialInstructions({ instructionPlan, feePayer, version: TX_VERSION });
    logPlanShape(step, plan);
    return runTransactionPlan(client, plan);
}

async function runTransactionPlan(client: Client, plan: TransactionPlan): Promise<Signature[]> {
    if (plan.kind === 'single') {
        return [await signSendConfirm(client.rpc as Rpc<SolanaRpcApi>, plan.message)];
    }
    // sequential + parallel are both executed in order (safe, slightly slower).
    const signatures: Signature[] = [];
    for (const child of plan.plans) {
        signatures.push(...(await runTransactionPlan(client, child)));
    }
    return signatures;
}

/**
 * Collects a run's on-chain artefacts (labeled signatures) so it is inspectable
 * afterwards; `step` plans and sends an instruction plan and records it.
 */
function trackSteps(client: Client) {
    const txLog: Array<{ step: string; signature: string }> = [];
    const record = (step: string, signatures: Signature[]) =>
        signatures.forEach((signature, i) =>
            txLog.push({
                step: signatures.length > 1 ? `${step} [${i + 1}/${signatures.length}]` : step,
                signature,
            }),
        );
    const step = async (label: string, feePayer: TransactionSigner, plan: InstructionPlan) =>
        record(label, await runPlan(client, feePayer, plan, label));
    return { txLog, record, step };
}

/** The ElGamal public key of a key pair, as the `Address` a mint extension stores. */
function elgamalPubkeyAddress(keys: ConfidentialKeys): Address {
    const pubkey = keys.elgamal.pubkey();
    try {
        return getAddressDecoder().decode(pubkey.toBytes());
    } finally {
        pubkey.free();
    }
}

describeSkipIf(!RUN)('confidential transfer (devnet e2e)', () => {
    let client: Client;
    let payer: KeyPairSigner<string>;

    beforeAll(async () => {
        const rpc = createSolanaRpc(RPC_URL);
        client = { rpc, rpcSubscriptions: undefined as never } as unknown as Client;

        // Sanity: the proof program must be live on this cluster.
        const proofProgram = await rpc.getAccountInfo(ZK_PROOF_PROGRAM, { encoding: 'base64' }).send();
        if (!proofProgram.value?.executable) {
            throw new Error(
                `ZK ElGamal Proof Program is not executable at ${RPC_URL} — pick a cluster where it is live.`,
            );
        }

        const secret = process.env.CONFIDENTIAL_PAYER_SECRET?.trim();
        if (secret) {
            // Accept either a JSON byte array (CLI id.json) or a base58 string (Phantom export).
            const bytes = secret.startsWith('[')
                ? Uint8Array.from(JSON.parse(secret) as number[])
                : new Uint8Array(getBase58Encoder().encode(secret));
            payer = await createKeyPairSignerFromBytes(bytes);
        } else {
            payer = await generateKeyPairSigner();
            try {
                await airdropAndWait(rpc, payer.address, 1);
            } catch (err) {
                throw new Error(
                    `Could not fund the payer via airdrop on ${RPC_URL} (public devnet faucets are rate-limited). ` +
                        `Set CONFIDENTIAL_PAYER_SECRET to a pre-funded keypair secret (JSON array of 64 bytes) and re-run. ` +
                        `Underlying error: ${(err as Error).message}`,
                );
            }
        }

        // Confidential ops need lamports for fees + (reclaimable) context-state rent.
        const { value: balance } = await rpc.getBalance(payer.address).send();
        if (BigInt(balance) < 50_000_000n) {
            throw new Error(
                `Payer ${payer.address} has ${balance} lamports — fund it with at least ~0.05 SOL before running.`,
            );
        }
    }, 120_000);

    it('runs configure → deposit → apply → transfer → withdraw → empty with decrypted balance checks', async () => {
        const rpc = client.rpc as Rpc<SolanaRpcApi>;
        const mint = await generateKeyPairSigner();
        const recipient = await generateKeyPairSigner();

        const [senderAta] = await findAssociatedTokenPda({
            owner: payer.address,
            mint: mint.address,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        });
        const [recipientAta] = await findAssociatedTokenPda({
            owner: recipient.address,
            mint: mint.address,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        });

        const { txLog, record, step } = trackSteps(client);

        // 1. Create the mint with confidential balances (opt-in so both accounts
        //    are usable immediately, no manual approval step).
        const createMintTx = await new Token()
            .withConfidentialBalances({ authority: payer.address, policy: 'opt-in' })
            .buildTransaction({
                rpc: rpc as Rpc<SolanaRpcApiMainnet>,
                decimals: DECIMALS,
                mintAuthority: payer,
                mint,
                feePayer: payer,
            });
        record('create-mint', [await signSendConfirm(rpc, createMintTx)]);
        await waitForToken2022Account(rpc, mint.address);

        // Derive sender + recipient confidential keys, bound to the wallet alone.
        const senderKeys = await deriveConfidentialKeys({ signer: payer });
        const recipientKeys = await deriveConfidentialKeys({ signer: recipient });

        try {
            // 2. Configure both accounts for confidential transfers.
            await step(
                'configure-sender',
                payer,
                await createConfigureConfidentialAccountInstructionPlan({
                    rpc,
                    payer,
                    owner: payer,
                    mint: mint.address,
                    keys: senderKeys,
                }),
            );
            await step(
                'configure-recipient',
                payer,
                await createConfigureConfidentialAccountInstructionPlan({
                    rpc,
                    payer,
                    owner: recipient,
                    mint: mint.address,
                    keys: recipientKeys,
                }),
            );
            await waitForToken2022Account(rpc, senderAta);
            await waitForToken2022Account(rpc, recipientAta);

            // 3. Mint plaintext tokens to the sender's ATA.
            await step(
                'mint-to-sender',
                payer,
                singleInstructionPlan(
                    getMintToInstruction({
                        mint: mint.address,
                        token: senderAta,
                        mintAuthority: payer,
                        amount: MINT_AMOUNT,
                    }),
                ),
            );

            // 4. Deposit into the confidential pending balance, then apply it.
            await step(
                'deposit',
                payer,
                await createConfidentialDepositInstructionPlan({
                    rpc,
                    mint: mint.address,
                    tokenAccount: senderAta,
                    authority: payer,
                    amount: MINT_AMOUNT,
                }),
            );
            await step(
                'apply-sender',
                payer,
                await createApplyConfidentialPendingBalanceInstructionPlan({
                    rpc,
                    tokenAccount: senderAta,
                    authority: payer,
                    keys: senderKeys,
                }),
            );

            const senderAfterApply = await inspectConfidentialAccount(rpc, senderAta, senderKeys);
            expect(senderAfterApply?.decrypted?.availableBalance).toBe(MINT_AMOUNT);

            // 5. Confidential transfer sender → recipient.
            await step(
                'confidential-transfer',
                payer,
                await createConfidentialTransferInstructionPlan({
                    rpc,
                    payer,
                    mint: mint.address,
                    sourceToken: senderAta,
                    destinationToken: recipientAta,
                    authority: payer,
                    amount: TRANSFER_AMOUNT,
                    keys: senderKeys,
                }),
            );

            // 6. Recipient applies its pending balance, then we assert the decrypted amount.
            await step(
                'apply-recipient',
                payer,
                await createApplyConfidentialPendingBalanceInstructionPlan({
                    rpc,
                    tokenAccount: recipientAta,
                    authority: recipient,
                    keys: recipientKeys,
                }),
            );

            const recipientAfter = await inspectConfidentialAccount(rpc, recipientAta, recipientKeys);
            expect(recipientAfter?.decrypted?.availableBalance).toBe(TRANSFER_AMOUNT);

            const senderAfterTransfer = await inspectConfidentialAccount(rpc, senderAta, senderKeys);
            expect(senderAfterTransfer?.decrypted?.availableBalance).toBe(MINT_AMOUNT - TRANSFER_AMOUNT);

            // 7. Recipient withdraws the full confidential balance back to plaintext,
            //    then empties + the account is left at zero available balance.
            await step(
                'withdraw',
                payer,
                await createConfidentialWithdrawInstructionPlan({
                    rpc,
                    payer,
                    mint: mint.address,
                    tokenAccount: recipientAta,
                    authority: recipient,
                    amount: TRANSFER_AMOUNT,
                    keys: recipientKeys,
                }),
            );

            const recipientAfterWithdraw = await inspectConfidentialAccount(rpc, recipientAta, recipientKeys);
            expect(recipientAfterWithdraw?.decrypted?.availableBalance).toBe(0n);

            await step(
                'empty-account',
                payer, // payer funds fees; recipient is only the account authority
                await createEmptyConfidentialAccountInstructionPlan({
                    rpc,
                    payer,
                    tokenAccount: recipientAta,
                    authority: recipient,
                    keys: recipientKeys,
                }),
            );

            // The account still exists (empty zeroes the balance, it doesn't
            // close the account) and its available balance decrypts to zero.
            const recipientAfterEmpty = await inspectConfidentialAccount(rpc, recipientAta, recipientKeys);
            expect(recipientAfterEmpty).not.toBeNull();
            expect(recipientAfterEmpty?.decrypted?.availableBalance).toBe(0n);
        } finally {
            freeConfidentialKeys(senderKeys);
            freeConfidentialKeys(recipientKeys);
            emitArtefacts({
                run: 'transfer',
                cluster: clusterParam(RPC_URL),
                mint: mint.address,
                payer: payer.address,
                recipient: recipient.address,
                senderAta,
                recipientAta,
                transactions: txLog,
            });
        }
    }, 300_000);

    /**
     * Runs the real fee-aware helper end to end, with no mocks: the five proofs
     * it builds are only accepted if they match the fee the program computes for
     * the epoch the transfer lands in, so a wrong schedule fails on-chain.
     *
     * Both schedule branches are covered without waiting for an epoch to pass.
     * A fresh mint has `newerTransferFee.epoch` equal to its creation epoch, so the
     * first transfer reads the newer schedule. `SetTransferFee` then schedules a
     * different fee two epochs out, so the second transfer must read the older
     * one. The raised fee differs in both rate and cap, so proving against it would
     * be rejected.
     */
    it('transfers on a ConfidentialTransferFee mint under both fee schedules, withholding the fee', async () => {
        const rpc = client.rpc as Rpc<SolanaRpcApi>;
        const mint = await generateKeyPairSigner();
        const recipient = await generateKeyPairSigner();
        // Each withheld fee is encrypted under this authority's ElGamal key. It
        // gets its own wallet so its key differs from both holders'.
        const withheldAuthority = await generateKeyPairSigner();

        const [senderAta] = await findAssociatedTokenPda({
            owner: payer.address,
            mint: mint.address,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        });
        const [recipientAta] = await findAssociatedTokenPda({
            owner: recipient.address,
            mint: mint.address,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        });

        const { txLog, record, step } = trackSteps(client);
        const senderKeys = await deriveConfidentialKeys({ signer: payer });
        const recipientKeys = await deriveConfidentialKeys({ signer: recipient });
        const withheldKeys = await deriveConfidentialKeys({ signer: withheldAuthority });

        const transfer = async (label: string) =>
            step(
                label,
                payer,
                await createConfidentialTransferInstructionPlan({
                    rpc,
                    payer,
                    mint: mint.address,
                    sourceToken: senderAta,
                    destinationToken: recipientAta,
                    authority: payer,
                    amount: TRANSFER_AMOUNT,
                    keys: senderKeys,
                }),
            );

        try {
            // 1. Create the mint with a 1% transfer fee, confidential balances
            //    (opt-in) and the confidential transfer fee.
            const createMintTx = await new Token()
                .withConfidentialBalances({ authority: payer.address, policy: 'opt-in' })
                .withTransferFee({
                    authority: payer.address,
                    withdrawAuthority: payer.address,
                    feeBasisPoints: FEE_BASIS_POINTS,
                    maximumFee: MAXIMUM_FEE,
                })
                .withConfidentialTransferFee({
                    authority: payer.address,
                    withdrawWithheldAuthorityElGamalPubkey: elgamalPubkeyAddress(withheldKeys),
                })
                .buildTransaction({
                    rpc: rpc as Rpc<SolanaRpcApiMainnet>,
                    decimals: DECIMALS,
                    mintAuthority: payer,
                    mint,
                    feePayer: payer,
                });
            record('create-mint', [await signSendConfirm(rpc, createMintTx)]);
            await waitForToken2022Account(rpc, mint.address);

            // 2. Configure both accounts. On a TransferFeeConfig mint the builder
            //    must also make room for ConfidentialTransferFeeAmount, or
            //    ConfigureAccount fails.
            for (const [label, owner, keys] of [
                ['configure-sender', payer, senderKeys],
                ['configure-recipient', recipient, recipientKeys],
            ] as const) {
                await step(
                    label,
                    payer,
                    await createConfigureConfidentialAccountInstructionPlan({
                        rpc,
                        payer,
                        owner,
                        mint: mint.address,
                        keys,
                    }),
                );
            }
            await waitForToken2022Account(rpc, senderAta);
            await waitForToken2022Account(rpc, recipientAta);

            // 3. Mint, deposit and apply on the sender.
            await step(
                'mint-to-sender',
                payer,
                singleInstructionPlan(
                    getMintToInstruction({
                        mint: mint.address,
                        token: senderAta,
                        mintAuthority: payer,
                        amount: MINT_AMOUNT,
                    }),
                ),
            );
            await step(
                'deposit',
                payer,
                await createConfidentialDepositInstructionPlan({
                    rpc,
                    mint: mint.address,
                    tokenAccount: senderAta,
                    authority: payer,
                    amount: MINT_AMOUNT,
                }),
            );
            await step(
                'apply-sender',
                payer,
                await createApplyConfidentialPendingBalanceInstructionPlan({
                    rpc,
                    tokenAccount: senderAta,
                    authority: payer,
                    keys: senderKeys,
                }),
            );

            // 4. First transfer: the creation-epoch schedule is the newer one.
            await transfer('transfer-newer-schedule');

            // 5. Schedule a different fee two epochs out, then transfer again
            //    under the older schedule (the original 1%).
            await step(
                'set-transfer-fee',
                payer,
                singleInstructionPlan(
                    getSetTransferFeeInstruction({
                        mint: mint.address,
                        transferFeeConfigAuthority: payer,
                        transferFeeBasisPoints: RAISED_FEE_BASIS_POINTS,
                        maximumFee: RAISED_MAXIMUM_FEE,
                    }),
                ),
            );
            const feeConfig = (await fetchMint(rpc, mint.address)).data.extensions;
            const schedule =
                feeConfig.__option === 'Some' ? feeConfig.value.find(e => e.__kind === 'TransferFeeConfig') : undefined;
            if (schedule?.__kind !== 'TransferFeeConfig') throw new Error('mint lost its TransferFeeConfig');
            const { epoch } = await rpc.getEpochInfo().send();
            expect(schedule.olderTransferFee.transferFeeBasisPoints).toBe(FEE_BASIS_POINTS);
            expect(schedule.newerTransferFee.transferFeeBasisPoints).toBe(RAISED_FEE_BASIS_POINTS);
            expect(schedule.newerTransferFee.epoch).toBeGreaterThan(epoch);

            await transfer('transfer-older-schedule');

            // 6. The recipient receives each transfer net of the fee, the sender
            //    is debited the gross amounts, and the fees sit withheld in the
            //    recipient's account, encrypted for the withdraw-withheld authority.
            await step(
                'apply-recipient',
                payer,
                await createApplyConfidentialPendingBalanceInstructionPlan({
                    rpc,
                    tokenAccount: recipientAta,
                    authority: recipient,
                    keys: recipientKeys,
                }),
            );

            const recipientAfter = await inspectConfidentialAccount(rpc, recipientAta, recipientKeys);
            expect(recipientAfter?.decrypted?.availableBalance).toBe(2n * (TRANSFER_AMOUNT - EXPECTED_FEE));

            const senderAfter = await inspectConfidentialAccount(rpc, senderAta, senderKeys);
            expect(senderAfter?.decrypted?.availableBalance).toBe(MINT_AMOUNT - 2n * TRANSFER_AMOUNT);

            const recipientExtensions = (await fetchToken(rpc, recipientAta)).data.extensions;
            const withheld =
                recipientExtensions.__option === 'Some'
                    ? recipientExtensions.value.find(e => e.__kind === 'ConfidentialTransferFeeAmount')
                    : undefined;
            if (withheld?.__kind !== 'ConfidentialTransferFeeAmount') {
                throw new Error('recipient account has no ConfidentialTransferFeeAmount extension');
            }
            expect(decryptElGamalBalance(withheldKeys.elgamal, new Uint8Array(withheld.withheldAmount))).toBe(
                2n * EXPECTED_FEE,
            );
        } finally {
            freeConfidentialKeys(senderKeys);
            freeConfidentialKeys(recipientKeys);
            freeConfidentialKeys(withheldKeys);
            emitArtefacts({
                run: 'transfer-with-fee',
                cluster: clusterParam(RPC_URL),
                mint: mint.address,
                payer: payer.address,
                recipient: recipient.address,
                senderAta,
                recipientAta,
                transactions: txLog,
            });
        }
    }, 300_000);
});
