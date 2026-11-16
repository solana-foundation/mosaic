import type { Client } from './setup.js';
import type { Address, Instruction, KeyPairSigner, Signature, TransactionSigner } from '@solana/kit';
import {
    appendTransactionMessageInstructions,
    createTransactionMessage,
    generateKeyPairSigner,
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
import { DEFAULT_COMMITMENT, DEFAULT_TIMEOUT, describeSkipIf, sendAndConfirmTransaction } from './helpers.js';
import { setupChainSuite } from './chain-helpers.js';
import {
    createInitLockAccountTransaction,
    createMintLockTransaction,
    createMmfInitTransaction,
    createPausedActionTransaction,
    createSettleMintLockTransaction,
    deriveLockAccountAddress,
} from '../../index.js';
import { inspectToken } from '../../inspection/index.js';
import type { FullTransaction } from '../../transaction-util.js';

/** Build a single-tx instruction list for the given fee payer and submit + confirm it. */
async function sendInstructions(
    client: Client,
    feePayer: TransactionSigner<string>,
    instructions: Instruction[],
): Promise<Signature> {
    const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
    const tx = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
    return sendAndConfirmTransaction(client, tx);
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
    await sendInstructions(client, payer, [
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
    ]);
    return ata;
}

describeSkipIf()('MMF Integration Tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;

    beforeAll(async () => {
        const suite = await setupChainSuite();
        client = suite.client;
        // Simplest setup: one signer plays mint/freeze/pause/PD authority + fee payer.
        mintAuthority = suite.payer;
        payer = suite.payer;
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
            await sendAndConfirmTransaction(client, tx);

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
            await sendAndConfirmTransaction(client, initTx);

            // Init lock account: PD signs everything; no holder signature needed.
            const initLock = await createInitLockAccountTransaction(client.rpc, {
                lockType: 'mint-lock',
                mint: mint.address,
                holder: holder.address,
                permanentDelegate: payer,
                freezeAuthority: payer,
                feePayer: payer,
            });
            await sendAndConfirmTransaction(client, initLock.transaction);

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
            await sendAndConfirmTransaction(
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
            await sendAndConfirmTransaction(
                client,
                await createSettleMintLockTransaction(client.rpc, {
                    mint: mint.address,
                    holder: holder.address,
                    permanentDelegate: payer,
                    freezeAuthority: payer,
                    feePayer: payer,
                }),
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

            await sendAndConfirmTransaction(
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
            );

            // MintTo refuses to mint into a frozen account (Token-2022 error 0x11), so the
            // holder ATA must be thawed before the sandwich runs. The sandwich is for the
            // *mint* paused state, not the account's frozen state.
            const holderAta = await whitelistHolder(client, payer, payer, mint.address, holder.address);

            await sendInstructions(client, payer, [
                getPauseInstruction(
                    { mint: mint.address, authority: payer },
                    { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
                ),
            ]);

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
            await sendAndConfirmTransaction(client, sandwichTx);

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
