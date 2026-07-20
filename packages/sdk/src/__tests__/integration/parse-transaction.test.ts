import {
    appendTransactionMessageInstructions,
    createTransactionMessage,
    generateKeyPairSigner,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import {
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
    getFreezeAccountInstruction,
    getThawAccountInstruction,
    getTransferCheckedInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
} from '@solana-program/token-2022';
import { Token } from '../../issuance';
import { createMintToTransaction } from '../../management';
import { parseTokenTransaction } from '../../inspection';
import { fetchOnChainTransaction, sendAndPollConfirm, setupChainSuite } from './chain-helpers';
import { describeSkipIf, DEFAULT_TIMEOUT } from './helpers';
import type { FullTransaction } from '../../transaction-util';

// One end-to-end integration test: build a single transaction that combines an
// idempotent ATA create, a Thaw (no-op if already thawed; here we Freeze first
// to make the Thaw meaningful), a TransferChecked, and a final FreezeAccount.
// This exercises the parser against a multi-instruction admin flow that's
// representative of issuer tooling (lock-on-receive style transfers).

describeSkipIf()('parseTokenTransaction (integration: multi-ix admin flow)', () => {
    it(
        'parses Freeze + TransferChecked + Freeze fetched from chain',
        async () => {
            const { client, payer, mintAuthority, freezeAuthority } = await setupChainSuite();

            // 1) Issue a mint where mintAuthority is also freeze authority for simplicity.
            const mint = await generateKeyPairSigner();
            const issuanceTx = await new Token()
                .withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: { name: 'Multi Token', symbol: 'MULTI', uri: 'https://example.com/multi.json' },
                    additionalMetadata: new Map(),
                })
                .buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });
            await sendAndPollConfirm(client.rpc, issuanceTx);

            // 2) Mint to the sender so they have something to transfer.
            const sender = mintAuthority;
            const senderMintTx = await createMintToTransaction(
                client.rpc,
                mint.address,
                sender.address,
                10,
                mintAuthority,
                payer,
            );
            await sendAndPollConfirm(client.rpc, senderMintTx);

            const recipient = await generateKeyPairSigner();
            const [senderAta] = await findAssociatedTokenPda({
                owner: sender.address,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
                mint: mint.address,
            });
            const [recipientAta] = await findAssociatedTokenPda({
                owner: recipient.address,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
                mint: mint.address,
            });

            // 3) Build the multi-ix transaction:
            //    a) idempotent ATA create for recipient (account-init via ATA program)
            //    b) FreezeAccount on the sender's ATA
            //    c) ThawAccount on the sender's ATA (we just froze it, this unblocks the transfer)
            //    d) TransferChecked sender -> recipient
            //    e) FreezeAccount on the recipient's ATA (lock-on-receive)
            const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
            const multiTx = pipe(
                createTransactionMessage({ version: 0 }),
                m => setTransactionMessageFeePayerSigner(payer, m),
                m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
                m =>
                    appendTransactionMessageInstructions(
                        [
                            getCreateAssociatedTokenIdempotentInstruction({
                                payer,
                                ata: recipientAta,
                                owner: recipient.address,
                                mint: mint.address,
                                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
                            }),
                            getFreezeAccountInstruction({
                                account: senderAta,
                                mint: mint.address,
                                owner: freezeAuthority,
                            }),
                            getThawAccountInstruction({
                                account: senderAta,
                                mint: mint.address,
                                owner: freezeAuthority,
                            }),
                            getTransferCheckedInstruction({
                                source: senderAta,
                                mint: mint.address,
                                destination: recipientAta,
                                authority: sender,
                                amount: 1_000_000n,
                                decimals: 6,
                            }),
                            getFreezeAccountInstruction({
                                account: recipientAta,
                                mint: mint.address,
                                owner: freezeAuthority,
                            }),
                        ],
                        m,
                    ),
            ) as FullTransaction;
            const sig = await sendAndPollConfirm(client.rpc, multiTx);
            const onChain = await fetchOnChainTransaction(client, sig);

            const parsed = parseTokenTransaction(onChain.wireBytes);

            expect(parsed.feePayer).toBe(payer.address);
            // Categories in landing order should match the instruction order we built.
            expect(parsed.instructions.map(e => e.category)).toEqual([
                'account-init',
                'freeze',
                'freeze',
                'transfer',
                'freeze',
            ]);
            expect(parsed.summary.freeze).toBe(3);
            expect(parsed.summary.transfer).toBe(1);
            expect(parsed.summary['account-init']).toBe(1);

            // Spot-check the parsed payload of the TransferChecked.
            const transfer = parsed.instructions[3];
            if (
                transfer.programLabel === 'token-2022' &&
                transfer.token2022.parsed?.instructionType === Token2022Instruction.TransferChecked
            ) {
                expect(transfer.token2022.parsed.accounts.source.address).toBe(senderAta);
                expect(transfer.token2022.parsed.accounts.destination.address).toBe(recipientAta);
                expect(transfer.token2022.parsed.accounts.mint.address).toBe(mint.address);
                expect(transfer.token2022.parsed.data.amount).toBe(1_000_000n);
                expect(transfer.token2022.parsed.data.decimals).toBe(6);
            } else {
                throw new Error('expected a parsed TransferChecked instruction');
            }

            // The final ix is a FreezeAccount on the recipient's ATA.
            const finalFreeze = parsed.instructions[4];
            if (
                finalFreeze.programLabel === 'token-2022' &&
                finalFreeze.token2022.parsed?.instructionType === Token2022Instruction.FreezeAccount
            ) {
                expect(finalFreeze.token2022.parsed.accounts.account.address).toBe(recipientAta);
                expect(finalFreeze.token2022.parsed.accounts.mint.address).toBe(mint.address);
            } else {
                throw new Error('expected a parsed FreezeAccount instruction');
            }
        },
        DEFAULT_TIMEOUT,
    );
});
