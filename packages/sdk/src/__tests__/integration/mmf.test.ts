import type { Client } from './setup';
import type { Address, KeyPairSigner, TransactionSigner } from '@solana/kit';
import {
    appendTransactionMessageInstructions,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    generateKeyPairSigner,
    lamports,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
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
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    signTransactionMessageWithSigners,
    type Signature,
} from '@solana/kit';

/**
 * Send + confirm a transaction using HTTP polling (getSignatureStatuses) instead of the
 * default WS signatureSubscribe path. The kit's sendAndConfirmTransactionFactory hangs
 * indefinitely against localnets with flaky WS subscriptions (e.g. surfpool when it has
 * been running for a while); HTTP polling stays responsive as long as RPC is healthy.
 *
 * On failure, fetches transaction logs and includes them in the thrown error.
 */
async function sendAndConfirmViaPolling(client: Client, tx: FullTransaction, label: string): Promise<Signature> {
    const signed = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signed);
    const wire = getBase64EncodedWireTransaction(signed);

    await client.rpc
        .sendTransaction(wire, {
            encoding: 'base64',
            skipPreflight: true,
            preflightCommitment: 'confirmed',
        })
        .send();

    const start = Date.now();
    const timeoutMs = 30_000;
    while (Date.now() - start < timeoutMs) {
        const res = await client.rpc.getSignatureStatuses([sig]).send();
        const status = res.value[0];
        if (status) {
            if (status.err) {
                const fetched = await client.rpc
                    .getTransaction(sig, { commitment: 'confirmed', encoding: 'base64', maxSupportedTransactionVersion: 0 })
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

describeSkipIf()('MMF Integration Tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;

    beforeAll(async () => {
        // Inline setup that uses HTTP polling instead of the kit's WS-subscription airdrop, so
        // we don't hang on localnets with flaky signatureSubscribe (surfpool, in particular).
        const rpc = createSolanaRpc('http://127.0.0.1:8899');
        const rpcSubscriptions = createSolanaRpcSubscriptions('ws://127.0.0.1:8900');
        client = { rpc, rpcSubscriptions };
        const fundedSigner = await generateKeyPairSigner();
        await client.rpc
            .requestAirdrop(fundedSigner.address, lamports(2_000_000_000n), { commitment: 'processed' })
            .send();
        // Poll until the funds actually land.
        const start = Date.now();
        while (Date.now() - start < 30_000) {
            const bal = await client.rpc.getBalance(fundedSigner.address, { commitment: 'confirmed' }).send();
            if (bal.value > 0n) break;
            await new Promise(r => setTimeout(r, 250));
        }
        // For MMF, simplest setup: one signer plays mint/freeze/pause/PD authority + fee payer.
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
                payer.address, // freezeAuthority = payer
            );

            await sendAndConfirmViaPolling(client, tx, 'mmf-init');

            const inspection = await inspectToken(client.rpc, mint.address);
            const extNames = inspection.extensions.map(e => e.name);
            // Pin the spec'd MMF extension set (no Confidential by default, no Scaled UI).
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

            // 1. create MMF mint
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

            // 2. create lock account (PD signs everything; no holder signature)
            const initLock = await createInitLockAccountTransaction(client.rpc, {
                lockType: 'mint-lock',
                mint: mint.address,
                holder: holder.address,
                permanentDelegate: payer, // PD = freeze auth = payer in this setup
                freezeAuthority: payer,
                feePayer: payer,
            });
            await sendAndConfirmViaPolling(client, initLock.transaction, 'init-lock');

            // verify lock account is at the deterministic with-seed address and is owned by Token-2022
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

            // 3. mint into the lock account: thaw, mintTo, freeze
            const mintLockTx = await createMintLockTransaction(client.rpc, {
                mint: mint.address,
                holder: holder.address,
                decimalAmount: 5,
                permanentDelegate: payer,
                freezeAuthority: payer,
                mintAuthority,
                feePayer: payer,
            });
            await sendAndConfirmViaPolling(client, mintLockTx, 'mint-lock');

            const lockBalance = await client.rpc
                .getTokenAccountBalance(initLock.lockAccount, { commitment: DEFAULT_COMMITMENT })
                .send();
            expect(lockBalance.value.amount).toEqual('5000000');

            // 3.5: whitelist the holder by thawing their (auto-frozen) ATA. In real flows the
            // issuer would have done this when onboarding the holder; we do it inline for the test.
            const [holderAta] = await findAssociatedTokenPda({
                owner: holder.address,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
                mint: mint.address,
            });
            const { value: bhWhitelist } = await client.rpc.getLatestBlockhash().send();
            const whitelistTx = pipe(
                createTransactionMessage({ version: 0 }),
                m => setTransactionMessageFeePayerSigner(payer, m),
                m => setTransactionMessageLifetimeUsingBlockhash(bhWhitelist, m),
                m =>
                    appendTransactionMessageInstructions(
                        [
                            getCreateAssociatedTokenIdempotentInstruction({
                                payer,
                                ata: holderAta,
                                owner: holder.address,
                                mint: mint.address,
                                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
                            }),
                            getThawAccountInstruction(
                                { account: holderAta, mint: mint.address, owner: payer },
                                { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
                            ),
                        ],
                        m,
                    ),
            ) as FullTransaction;
            await sendAndConfirmViaPolling(client, whitelistTx, 'whitelist-holder');

            // 4. settle to holder's ATA: idempotent ATA (no-op now), thaw lock, transferChecked, close
            const settleTx = await createSettleMintLockTransaction(client.rpc, {
                mint: mint.address,
                holder: holder.address,
                decimalAmount: 5,
                permanentDelegate: payer,
                freezeAuthority: payer,
                feePayer: payer,
            });
            await sendAndConfirmViaPolling(client, settleTx, 'settle');

            // holder ATA should hold the tokens; lock account should be closed
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

            // create mint
            const initTx = await createMmfInitTransaction(
                client.rpc,
                'MMF Pause',
                'MMFP',
                6,
                'https://example.com/mmfp.json',
                mintAuthority,
                mint,
                payer,
                payer.address,
            );
            await sendAndConfirmViaPolling(client, initTx, 'mmf-init');

            // Pre-create + thaw holder ATA. DAS=Frozen makes new accounts frozen, and MintTo
            // refuses to mint into a frozen account, so we thaw the ATA via the freeze authority
            // before pausing. (The pause sandwich is for the *mint* paused state, not account state.)
            const [holderAta] = await findAssociatedTokenPda({
                owner: holder.address,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
                mint: mint.address,
            });
            const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
            const ataTx = pipe(
                createTransactionMessage({ version: 0 }),
                m => setTransactionMessageFeePayerSigner(payer, m),
                m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
                m =>
                    appendTransactionMessageInstructions(
                        [
                            getCreateAssociatedTokenIdempotentInstruction({
                                payer,
                                ata: holderAta,
                                owner: holder.address,
                                mint: mint.address,
                                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
                            }),
                            getThawAccountInstruction(
                                { account: holderAta, mint: mint.address, owner: payer },
                                { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
                            ),
                        ],
                        m,
                    ),
            ) as FullTransaction;
            await sendAndConfirmViaPolling(client, ataTx, 'create-thaw-ata');

            // pause the mint
            const { value: bh2 } = await client.rpc.getLatestBlockhash().send();
            const pauseTx = pipe(
                createTransactionMessage({ version: 0 }),
                m => setTransactionMessageFeePayerSigner(payer, m),
                m => setTransactionMessageLifetimeUsingBlockhash(bh2, m),
                m =>
                    appendTransactionMessageInstructions(
                        [
                            getPauseInstruction(
                                { mint: mint.address, authority: payer },
                                { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
                            ),
                        ],
                        m,
                    ),
            ) as FullTransaction;
            await sendAndConfirmViaPolling(client, pauseTx, 'pause');

            // expected to be paused
            let inspection = await inspectToken(client.rpc, mint.address);
            const pausedExt = inspection.extensions.find(e => e.name === 'PausableConfig');
            expect((pausedExt?.details as { paused?: boolean })?.paused).toBe(true);

            // run pause-sandwich with a MintToChecked inside
            const sandwichTx = await createPausedActionTransaction(client.rpc, {
                mint: mint.address,
                pauseAuthority: payer,
                feePayer: payer,
                instructions: [
                    getMintToCheckedInstruction(
                        {
                            mint: mint.address,
                            mintAuthority,
                            token: holderAta as Address,
                            amount: 7_000_000n,
                            decimals: 6,
                        },
                        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
                    ),
                ],
            });
            await sendAndConfirmViaPolling(client, sandwichTx, 'pause-sandwich');

            // tokens minted, mint paused again
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
