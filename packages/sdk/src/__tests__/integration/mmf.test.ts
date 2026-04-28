import type { Client } from './setup';
import type { Address, Instruction, KeyPairSigner, Signature, TransactionSigner } from '@solana/kit';
import {
    appendTransactionMessageInstructions,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
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
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
    getMintToCheckedInstruction,
    getPauseInstruction,
    getThawAccountInstruction,
} from '@solana-program/token-2022';
import { DEFAULT_COMMITMENT, DEFAULT_TIMEOUT, describeSkipIf } from './helpers';
import {
    createInitLockAccountTransaction,
    createMintLockTransaction,
    createMmfInitTransaction,
    createPausedActionTransaction,
    createSettleMintLockTransaction,
    deriveLockAccountAddress,
} from '../..';
import { inspectToken } from '../../inspection';
import type { FullTransaction } from '../../transaction-util';

/**
 * Send + confirm a transaction using HTTP polling instead of the kit's WS signatureSubscribe
 * path. The default sendAndConfirmTransactionFactory hangs indefinitely against localnets with
 * flaky WS subscriptions (e.g. surfpool when it has been running a while); HTTP polling stays
 * responsive as long as RPC is healthy. On tx failure, fetches logs and includes them in the
 * thrown error so failures surface a useful diagnostic.
 */
async function sendAndConfirmViaPolling(client: Client, tx: FullTransaction, label: string): Promise<Signature> {
    const signed = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signed);
    const wire = getBase64EncodedWireTransaction(signed);

    await client.rpc
        .sendTransaction(wire, { encoding: 'base64', skipPreflight: true, preflightCommitment: 'confirmed' })
        .send();

    const start = Date.now();
    const timeoutMs = 30_000;
    while (Date.now() - start < timeoutMs) {
        const res = await client.rpc.getSignatureStatuses([sig]).send();
        const status = res.value[0];
        if (status) {
            if (status.err) {
                const fetched = await client.rpc
                    .getTransaction(sig, {
                        commitment: 'confirmed',
                        encoding: 'base64',
                        maxSupportedTransactionVersion: 0,
                    })
                    .send()
                    .catch(() => null);
                const logs = fetched?.meta?.logMessages?.join('\n') ?? '(no logs)';
                throw new Error(
                    `[${label}] tx failed: ${JSON.stringify(status.err, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}\n${logs}`,
                );
            }
            if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
                return sig;
            }
        }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`[${label}] confirmation timeout after ${timeoutMs}ms`);
}

/** Build a single-tx instruction list for the given fee payer and submit + confirm it. */
async function sendInstructions(
    client: Client,
    feePayer: TransactionSigner<string>,
    instructions: Instruction[],
    label: string,
): Promise<Signature> {
    const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
    const tx = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
    return sendAndConfirmViaPolling(client, tx, label);
}

/**
 * Whitelist a holder by creating their ATA and thawing it. In a real MMF flow the issuer
 * would do this once per holder during onboarding; tests use it inline before any operation
 * that transfers tokens to or from the holder's ATA.
 */
async function whitelistHolder(
    client: Client,
    payer: TransactionSigner<string>,
    freezeAuthority: TransactionSigner<string>,
    mint: Address,
    holder: Address,
): Promise<Address> {
    const [ata] = await findAssociatedTokenPda({ owner: holder, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint });
    await sendInstructions(
        client,
        payer,
        [
            getCreateAssociatedTokenIdempotentInstruction({
                payer,
                ata,
                owner: holder,
                mint,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            getThawAccountInstruction(
                { account: ata, mint, owner: freezeAuthority },
                { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
            ),
        ],
        'whitelist-holder',
    );
    return ata;
}

describeSkipIf()('MMF Integration Tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;

    beforeAll(async () => {
        // Inline setup using HTTP polling for the airdrop, since the shared setupTestSuite
        // uses the kit's WS-subscription airdropFactory which can hang on surfpool.
        const rpc = createSolanaRpc('http://127.0.0.1:8899');
        const rpcSubscriptions = createSolanaRpcSubscriptions('ws://127.0.0.1:8900');
        client = { rpc, rpcSubscriptions };
        const fundedSigner = await generateKeyPairSigner();
        await client.rpc
            .requestAirdrop(fundedSigner.address, lamports(2_000_000_000n), { commitment: 'processed' })
            .send();
        const start = Date.now();
        while (Date.now() - start < 30_000) {
            const bal = await client.rpc.getBalance(fundedSigner.address, { commitment: 'confirmed' }).send();
            if (bal.value > 0n) break;
            await new Promise(r => setTimeout(r, 250));
        }
        // Simplest setup: one signer plays mint/freeze/pause/PD authority + fee payer.
        mintAuthority = fundedSigner;
        payer = fundedSigner;
    }, DEFAULT_TIMEOUT);

    beforeEach(async () => {
        mint = await generateKeyPairSigner();
    });

    it(
        'creates an MMF mint with TransferHook initialized then cleared',
        async () => {
            const tx = await createMmfInitTransaction(
                client.rpc,
                'MMF',
                'MMF',
                6,
                'https://example.com/mmf.json',
                mintAuthority,
                mint,
                payer,
                payer.address,
            );
            await sendAndConfirmViaPolling(client, tx, 'mmf-init');

            const inspection = await inspectToken(client.rpc, mint.address);
            const extNames = inspection.extensions.map(e => e.name);
            expect(extNames).toEqual(expect.arrayContaining(['PausableConfig', 'PermanentDelegate', 'TokenMetadata']));
            expect(extNames).toContain('TransferHook');
            expect(extNames).not.toContain('ConfidentialTransferMint');
            expect(extNames).not.toContain('ScaledUiAmountConfig');
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'mint-lock end-to-end: init lock account, mint into it, settle to holder ATA',
        async () => {
            const holder = await generateKeyPairSigner();

            const initTx = await createMmfInitTransaction(
                client.rpc,
                'MMF Lock',
                'MMFL',
                6,
                'https://example.com/mmfl.json',
                mintAuthority,
                mint,
                payer,
                payer.address,
            );
            await sendAndConfirmViaPolling(client, initTx, 'mmf-init');

            // Init lock account: PD signs everything; no holder signature needed.
            const initLock = await createInitLockAccountTransaction(client.rpc, {
                lockType: 'mint-lock',
                mint: mint.address,
                holder: holder.address,
                permanentDelegate: payer,
                freezeAuthority: payer,
                feePayer: payer,
            });
            await sendAndConfirmViaPolling(client, initLock.transaction, 'init-lock');

            const expected = await deriveLockAccountAddress({
                lockType: 'mint-lock',
                permanentDelegate: payer.address,
                mint: mint.address,
                holder: holder.address,
            });
            expect(initLock.lockAccount).toEqual(expected.address);
            const lockInfo = await client.rpc
                .getAccountInfo(initLock.lockAccount, { encoding: 'jsonParsed', commitment: DEFAULT_COMMITMENT })
                .send();
            expect(lockInfo.value?.owner).toEqual(TOKEN_2022_PROGRAM_ADDRESS);
            const parsed = (lockInfo.value?.data as { parsed?: { info?: Record<string, unknown> } }).parsed?.info;
            expect(parsed).toBeDefined();
            expect(parsed?.owner).toEqual(holder.address);
            expect(parsed?.closeAuthority).toEqual(payer.address);
            expect(parsed?.state).toEqual('frozen');

            // Mint into the lock account: thaw, mintTo, freeze (PD + freeze auth sign).
            await sendAndConfirmViaPolling(
                client,
                await createMintLockTransaction(client.rpc, {
                    mint: mint.address,
                    holder: holder.address,
                    decimalAmount: 5,
                    permanentDelegate: payer,
                    freezeAuthority: payer,
                    mintAuthority,
                    feePayer: payer,
                }),
                'mint-lock',
            );

            const lockBalance = await client.rpc
                .getTokenAccountBalance(initLock.lockAccount, { commitment: DEFAULT_COMMITMENT })
                .send();
            expect(lockBalance.value.amount).toEqual('5000000');

            // Holder must be whitelisted (ATA thawed) before tokens can be transferred to them.
            const holderAta = await whitelistHolder(client, payer, payer, mint.address, holder.address);

            // Settle: drain the full lock balance to the holder's ATA, close the lock account.
            // Settle no longer takes an amount — it always drains via live RPC balance — so
            // CloseAccount can't fail on a stale partial-amount residual.
            await sendAndConfirmViaPolling(
                client,
                await createSettleMintLockTransaction(client.rpc, {
                    mint: mint.address,
                    holder: holder.address,
                    permanentDelegate: payer,
                    freezeAuthority: payer,
                    feePayer: payer,
                }),
                'settle',
            );

            const ataBalance = await client.rpc
                .getTokenAccountBalance(holderAta, { commitment: DEFAULT_COMMITMENT })
                .send();
            expect(ataBalance.value.amount).toEqual('5000000');

            const closedLock = await client.rpc
                .getAccountInfo(initLock.lockAccount, { commitment: DEFAULT_COMMITMENT })
                .send();
            expect(closedLock.value).toBeNull();
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'pause sandwich: paused mint accepts mint-to inside resume/pause window',
        async () => {
            const holder = await generateKeyPairSigner();

            await sendAndConfirmViaPolling(
                client,
                await createMmfInitTransaction(
                    client.rpc,
                    'MMF Pause',
                    'MMFP',
                    6,
                    'https://example.com/mmfp.json',
                    mintAuthority,
                    mint,
                    payer,
                    payer.address,
                ),
                'mmf-init',
            );

            // MintTo refuses to mint into a frozen account (Token-2022 error 0x11), so the
            // holder ATA must be thawed before the sandwich runs. The sandwich is for the
            // *mint* paused state, not the account's frozen state.
            const holderAta = await whitelistHolder(client, payer, payer, mint.address, holder.address);

            await sendInstructions(
                client,
                payer,
                [
                    getPauseInstruction(
                        { mint: mint.address, authority: payer },
                        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
                    ),
                ],
                'pause',
            );

            let inspection = await inspectToken(client.rpc, mint.address);
            const pausedExt = inspection.extensions.find(e => e.name === 'PausableConfig');
            expect((pausedExt?.details as { paused?: boolean })?.paused).toBe(true);

            const sandwichTx = await createPausedActionTransaction(client.rpc, {
                mint: mint.address,
                pauseAuthority: payer,
                feePayer: payer,
                instructions: [
                    getMintToCheckedInstruction(
                        {
                            mint: mint.address,
                            mintAuthority,
                            token: holderAta,
                            amount: 7_000_000n,
                            decimals: 6,
                        },
                        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
                    ),
                ],
            });
            await sendAndConfirmViaPolling(client, sandwichTx, 'pause-sandwich');

            const ataBalance = await client.rpc
                .getTokenAccountBalance(holderAta, { commitment: DEFAULT_COMMITMENT })
                .send();
            expect(ataBalance.value.amount).toEqual('7000000');

            inspection = await inspectToken(client.rpc, mint.address);
            const stillPaused = inspection.extensions.find(e => e.name === 'PausableConfig');
            expect((stillPaused?.details as { paused?: boolean })?.paused).toBe(true);
        },
        DEFAULT_TIMEOUT,
    );
});
