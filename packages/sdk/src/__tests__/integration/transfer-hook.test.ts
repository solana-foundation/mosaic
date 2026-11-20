import setupTestSuite from './setup.js';
import type { Client } from './setup.js';
import { generateKeyPairSigner, type KeyPairSigner, type TransactionSigner } from '@solana/kit';
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
    sendAndConfirmTransaction,
    assertTxSuccess,
    assertBalances,
    DEFAULT_TIMEOUT,
    DEFAULT_COMMITMENT,
    describeSkipIf,
} from './helpers.js';
import {
    EXTRA_METAS,
    FIXED_EXTRA,
    TRANSFER_HOOK_EXAMPLE_PROGRAM_ID,
    initializeExtraAccountMetasTransaction,
} from './transfer-hook-fixture.js';
import { createCustomTokenInitTransaction } from '../../templates/index.js';
import {
    createMintToTransaction,
    createForceTransferTransaction,
    createUpdateTransferHookTransaction,
} from '../../management/index.js';
import { createTransferInstructions, createTransferTransaction } from '../../transfer/index.js';
import { findExtraAccountMetaListPda, type ExtraAccountMeta } from '../../transfer/transfer-hook.js';
import { decimalAmountToRaw } from '../../transaction-util.js';

const DECIMALS = 6;

describeSkipIf()('Transfer Hook Integration Tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;
    let sender: KeyPairSigner<string>;
    let receiver: KeyPairSigner<string>;

    beforeAll(async () => {
        const testSuite = await setupTestSuite();
        client = testSuite.client;
        mintAuthority = testSuite.mintAuthority;
        payer = testSuite.payer;

        const hookProgram = await client.rpc.getAccountInfo(TRANSFER_HOOK_EXAMPLE_PROGRAM_ID).send();
        if (!hookProgram.value?.executable) {
            throw new Error(
                `Transfer hook example program is not loaded at ${TRANSFER_HOOK_EXAMPLE_PROGRAM_ID}; ` +
                    'run the suite through `pnpm test:integration`, which loads it with --bpf-program',
            );
        }
    });

    /** Creates a custom token whose TransferHook starts inactive, then mints to the sender (and receiver). */
    async function createHookedMint(options: { mintToReceiver: boolean }) {
        mint = await generateKeyPairSigner();
        sender = await generateKeyPairSigner();
        receiver = await generateKeyPairSigner();

        const createTx = await createCustomTokenInitTransaction(
            client.rpc,
            'Hooked Token',
            'HOOK',
            DECIMALS,
            'https://example.com/hook.json',
            mintAuthority,
            mint,
            payer,
            { enableMetadata: true, enablePermanentDelegate: true, enableTransferHook: true },
        );
        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

        const mintToSender = await createMintToTransaction(
            client.rpc,
            mint.address,
            sender.address,
            1_000,
            mintAuthority,
            payer,
        );
        await sendAndConfirmTransaction(client, mintToSender, DEFAULT_COMMITMENT);
        if (options.mintToReceiver) {
            const mintToReceiver = await createMintToTransaction(
                client.rpc,
                mint.address,
                receiver.address,
                10,
                mintAuthority,
                payer,
            );
            await sendAndConfirmTransaction(client, mintToReceiver, DEFAULT_COMMITMENT);
        }
    }

    async function attachHook(metas: ExtraAccountMeta[] | null) {
        const attachTx = await createUpdateTransferHookTransaction(client.rpc, {
            mint: mint.address,
            authority: mintAuthority,
            programId: TRANSFER_HOOK_EXAMPLE_PROGRAM_ID,
            feePayer: payer,
        });
        await sendAndConfirmTransaction(client, attachTx, DEFAULT_COMMITMENT);
        if (!metas) return;

        const initTx = await initializeExtraAccountMetasTransaction(client, mint.address, mintAuthority, payer, metas);
        await sendAndConfirmTransaction(client, initTx, DEFAULT_COMMITMENT);
    }

    it(
        'transfers an inactive-hook mint with a plain TransferChecked',
        async () => {
            await createHookedMint({ mintToReceiver: true });

            const instructions = await createTransferInstructions({
                rpc: client.rpc,
                mint: mint.address,
                from: sender.address,
                to: receiver.address,
                feePayer: payer,
                authority: sender,
                amount: '1',
            });
            const transfer = instructions[instructions.length - 1];
            expect(transfer.accounts).toHaveLength(4);

            const tx = await createTransferTransaction({
                rpc: client.rpc,
                mint: mint.address,
                from: sender.address,
                to: receiver.address,
                feePayer: payer,
                authority: sender,
                amount: '1',
            });
            assertTxSuccess(await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT));
            await assertBalances(client.rpc, [
                { wallet: sender.address, mint: mint.address, expectedAmount: decimalAmountToRaw(999, DECIMALS) },
                { wallet: receiver.address, mint: mint.address, expectedAmount: decimalAmountToRaw(11, DECIMALS) },
            ]);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'transfers a mint whose attached hook declares extra accounts of every kind',
        async () => {
            await createHookedMint({ mintToReceiver: true });
            await attachHook(EXTRA_METAS);

            const tx = await createTransferTransaction({
                rpc: client.rpc,
                mint: mint.address,
                from: sender.address,
                to: receiver.address,
                feePayer: payer,
                authority: sender,
                amount: '2.5',
            });
            assertTxSuccess(await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT));

            // The transfer carries the 4 base accounts, the 6 extras, the hook program and the
            // validation account, in that order.
            const transfer = tx.instructions[tx.instructions.length - 1];
            const [validationAccount] = await findExtraAccountMetaListPda(
                { mint: mint.address },
                { programAddress: TRANSFER_HOOK_EXAMPLE_PROGRAM_ID },
            );
            expect(transfer.accounts?.map(a => a.address).slice(4)).toEqual([
                FIXED_EXTRA,
                expect.any(String),
                expect.any(String),
                expect.any(String),
                sender.address,
                expect.any(String),
                TRANSFER_HOOK_EXAMPLE_PROGRAM_ID,
                validationAccount,
            ]);

            await assertBalances(client.rpc, [
                { wallet: sender.address, mint: mint.address, expectedAmount: decimalAmountToRaw('997.5', DECIMALS) },
                { wallet: receiver.address, mint: mint.address, expectedAmount: decimalAmountToRaw('12.5', DECIMALS) },
            ]);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'transfers a hooked mint to a recipient whose token account is created in the same transaction',
        async () => {
            await createHookedMint({ mintToReceiver: false });
            // No extra reads the destination's data, which does not exist until the transfer runs.
            await attachHook(EXTRA_METAS);

            const tx = await createTransferTransaction({
                rpc: client.rpc,
                mint: mint.address,
                from: sender.address,
                to: receiver.address,
                feePayer: payer,
                authority: sender,
                amount: '3',
                memo: 'hooked',
            });
            assertTxSuccess(await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT));
            await assertBalances(client.rpc, [
                { wallet: sender.address, mint: mint.address, expectedAmount: decimalAmountToRaw(997, DECIMALS) },
                { wallet: receiver.address, mint: mint.address, expectedAmount: decimalAmountToRaw(3, DECIMALS) },
            ]);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'force-transfers a hooked mint through the permanent delegate',
        async () => {
            await createHookedMint({ mintToReceiver: true });
            await attachHook(EXTRA_METAS);

            const tx = await createForceTransferTransaction(
                client.rpc,
                mint.address,
                sender.address,
                receiver.address,
                4,
                mintAuthority,
                payer,
            );
            assertTxSuccess(await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT));

            // The authority seen by the hook is the permanent delegate, so extra 9 (source owner)
            // is the sender while extra 6 is seeded by the delegate.
            const [senderAta] = await findAssociatedTokenPda({
                owner: sender.address,
                mint: mint.address,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            });
            const transfer = tx.instructions[tx.instructions.length - 1];
            expect(transfer.accounts?.[0].address).toBe(senderAta);
            expect(transfer.accounts?.[8].address).toBe(sender.address);
            expect(transfer.accounts?.[3].address).toBe(mintAuthority.address);

            await assertBalances(client.rpc, [
                { wallet: sender.address, mint: mint.address, expectedAmount: decimalAmountToRaw(996, DECIMALS) },
                { wallet: receiver.address, mint: mint.address, expectedAmount: decimalAmountToRaw(14, DECIMALS) },
            ]);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'refuses to build a transfer while the attached hook has no extra account metas account',
        async () => {
            await createHookedMint({ mintToReceiver: true });
            // Token-2022 rejects every transfer of this mint with InvalidAccountData until the
            // hook initializes its validation account, so the builder fails early instead.
            await attachHook(null);

            await expect(
                createTransferTransaction({
                    rpc: client.rpc,
                    mint: mint.address,
                    from: sender.address,
                    to: receiver.address,
                    feePayer: payer,
                    authority: sender,
                    amount: '1',
                }),
            ).rejects.toThrow('extra account metas account');
        },
        DEFAULT_TIMEOUT,
    );
});
