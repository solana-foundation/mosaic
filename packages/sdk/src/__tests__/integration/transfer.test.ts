import setupTestSuite from './setup';
import type { Client } from './setup';
import type { KeyPairSigner, TransactionSigner } from 'gill';
import { generateKeyPairSigner } from 'gill';
import {
    sendAndConfirmTransaction,
    assertTxSuccess,
    assertTxFailure,
    assertBalance,
    assertBalances,
    isAccountFrozen,
    DEFAULT_TIMEOUT,
    DEFAULT_COMMITMENT,
    describeSkipIf,
    assertMemo,
} from './helpers';
import { Token } from '../../issuance';
import { createMintToTransaction } from '../../management';
import { createTransferTransaction } from '../../transfer';
import { decimalAmountToRaw } from '../../transactionUtil';
import { getFreezeTransaction, TOKEN_ACL_PROGRAM_ID } from '../../token-acl';
import { getAssociatedTokenAccountAddress, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs';

describeSkipIf()('Transfer Integration Tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let freezeAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;

    beforeAll(async () => {
        const testSuite = await setupTestSuite();
        client = testSuite.client;
        mintAuthority = testSuite.mintAuthority;
        freezeAuthority = testSuite.freezeAuthority;
        payer = testSuite.payer;
    });

    beforeEach(async () => {
        mint = await generateKeyPairSigner();
    });

    describe('Basic Transfers', () => {
        it(
            'should transfer between existing accounts',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();

                // Given: A token exists with minted tokens in two accounts
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Transfer Test Token',
                        symbol: 'XFER',
                        uri: 'https://example.com/xfer.json',
                    },
                    additionalMetadata: new Map(),
                });

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to sender
                const mintToSenderTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToSenderTx, DEFAULT_COMMITMENT);

                // Mint tokens to receiver to create their ATA
                const mintToReceiverTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    receiver.address,
                    500_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToReceiverTx, DEFAULT_COMMITMENT);

                // When: Transfer from sender to receiver
                const transferTx = await createTransferTransaction({
                    rpc: client.rpc,
                    mint: mint.address,
                    from: sender.address,
                    to: receiver.address,
                    feePayer: payer,
                    authority: sender,
                    amount: '250000', // Transfer 250k tokens (decimal amount)
                });

                const signature = await sendAndConfirmTransaction(client, transferTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Balances are updated correctly
                await assertBalances(
                    client.rpc,
                    [
                        {
                            wallet: sender.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(750_000, 6), // 1M - 250k
                        },
                        {
                            wallet: receiver.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(750_000, 6), // 500k + 250k
                        },
                    ],
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should transfer with destination ATA creation',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();

                // Given: A token with only sender having tokens
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'ATA Create Token',
                        symbol: 'ATAC',
                        uri: 'https://example.com/atac.json',
                    },
                    additionalMetadata: new Map(),
                });

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to sender
                const mintToSenderTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToSenderTx, DEFAULT_COMMITMENT);

                // Verify receiver has no ATA yet
                await assertBalance(client.rpc, receiver.address, mint.address, 0n);

                // When: Transfer to receiver (ATA doesn't exist)
                const transferTx = await createTransferTransaction({
                    rpc: client.rpc,
                    mint: mint.address,
                    from: sender.address,
                    to: receiver.address,
                    feePayer: payer,
                    authority: sender,
                    amount: '400000', // Transfer 400k tokens
                });

                const signature = await sendAndConfirmTransaction(client, transferTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Receiver ATA was created and has tokens
                await assertBalances(
                    client.rpc,
                    [
                        {
                            wallet: sender.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(600_000, 6),
                        },
                        {
                            wallet: receiver.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(400_000, 6),
                        },
                    ],
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should transfer with memo',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();

                // Given: A token with sender having tokens
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Memo Token',
                        symbol: 'MEMO',
                        uri: 'https://example.com/memo.json',
                    },
                    additionalMetadata: new Map(),
                });

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to sender
                const mintToSenderTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToSenderTx, DEFAULT_COMMITMENT);

                // When: Transfer with a memo
                const transferTx = await createTransferTransaction({
                    rpc: client.rpc,
                    mint: mint.address,
                    from: sender.address,
                    to: receiver.address,
                    feePayer: payer,
                    authority: sender,
                    amount: '100000',
                    memo: 'Payment for services rendered',
                });

                const signature = await sendAndConfirmTransaction(
                    client,
                    transferTx,
                    'confirmed', // getTransaction doesn't support processed commitment
                );
                assertTxSuccess(signature);

                await assertMemo(client.rpc, signature, 'Payment for services rendered');

                // Then: Transfer succeeded with correct balances
                await assertBalances(
                    client.rpc,
                    [
                        {
                            wallet: sender.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(900_000, 6),
                        },
                        {
                            wallet: receiver.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(100_000, 6),
                        },
                    ],
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it.skip(
            'should transfer with permissionless thaw',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();

                // Given: A token with SRFC-37 enabled (blocklist mode)
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'SRFC37 Transfer Token',
                            symbol: 'SRFC',
                            uri: 'https://example.com/srfc.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withDefaultAccountState(false); // false = frozen (blocklist)

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to sender
                const mintToSenderTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToSenderTx, DEFAULT_COMMITMENT);

                // When: Transfer to receiver (will create frozen ATA and thaw it)
                const transferTx = await createTransferTransaction({
                    rpc: client.rpc,
                    mint: mint.address,
                    from: sender.address,
                    to: receiver.address,
                    feePayer: payer,
                    authority: sender,
                    amount: '300000',
                });

                const signature = await sendAndConfirmTransaction(client, transferTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Transfer succeeded and receiver account was thawed
                await assertBalances(
                    client.rpc,
                    [
                        {
                            wallet: sender.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(700_000, 6),
                        },
                        {
                            wallet: receiver.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(300_000, 6),
                        },
                    ],
                    DEFAULT_COMMITMENT,
                );

                // Verify receiver account is not frozen after transfer
                const frozen = await isAccountFrozen(client.rpc, receiver.address, mint.address);
                expect(frozen).toBe(false);
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Edge Cases', () => {
        it(
            'should transfer full balance',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();

                // Given: A token with sender having tokens
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Full Balance Token',
                        symbol: 'FULL',
                        uri: 'https://example.com/full.json',
                    },
                    additionalMetadata: new Map(),
                });

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to sender
                const initialAmount = 1_000_000;
                const mintToSenderTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    initialAmount,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToSenderTx, DEFAULT_COMMITMENT);

                // When: Transfer entire balance
                const transferTx = await createTransferTransaction({
                    rpc: client.rpc,
                    mint: mint.address,
                    from: sender.address,
                    to: receiver.address,
                    feePayer: payer,
                    authority: sender,
                    amount: initialAmount.toString(),
                });

                const signature = await sendAndConfirmTransaction(client, transferTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Sender has 0, receiver has all
                await assertBalances(
                    client.rpc,
                    [
                        {
                            wallet: sender.address,
                            mint: mint.address,
                            expectedAmount: 0n,
                        },
                        {
                            wallet: receiver.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(initialAmount, 6),
                        },
                    ],
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it.skip(
            'should fail transfer with frozen source',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();

                // Given: A token with Token ACL as freeze authority
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Frozen Source Token',
                        symbol: 'FROZ',
                        uri: 'https://example.com/froz.json',
                    },
                    additionalMetadata: new Map(),
                });

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to sender
                const mintToSenderTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToSenderTx, DEFAULT_COMMITMENT);

                // Freeze sender account
                const senderTokenAccount = await getAssociatedTokenAccountAddress(
                    mint.address,
                    sender.address,
                    TOKEN_2022_PROGRAM_ADDRESS,
                );

                const freezeTx = await getFreezeTransaction({
                    rpc: client.rpc,
                    payer,
                    authority: freezeAuthority,
                    tokenAccount: senderTokenAccount,
                });
                await sendAndConfirmTransaction(client, freezeTx, DEFAULT_COMMITMENT);

                // Verify sender is frozen
                const frozen = await isAccountFrozen(client.rpc, sender.address, mint.address);
                expect(frozen).toBe(true);

                // When: Try to transfer from frozen account
                const transferTx = await createTransferTransaction({
                    rpc: client.rpc,
                    mint: mint.address,
                    from: sender.address,
                    to: receiver.address,
                    feePayer: payer,
                    authority: sender,
                    amount: '100000',
                });

                // Then: Transaction should fail
                await assertTxFailure(client, transferTx);

                // Verify balances unchanged
                await assertBalance(client.rpc, sender.address, mint.address, decimalAmountToRaw(1_000_000, 6));
            },
            DEFAULT_TIMEOUT,
        );

        it.skip(
            'should transfer with frozen destination (should thaw if SRFC-37)',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();

                // Given: A token with SRFC-37 enabled, receiver account exists but is frozen
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'SRFC37 Frozen Dest Token',
                            symbol: 'SRFCD',
                            uri: 'https://example.com/srfcd.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withDefaultAccountState(false); // frozen by default

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to both sender and receiver
                const mintToSenderTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToSenderTx, DEFAULT_COMMITMENT);

                const mintToReceiverTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    receiver.address,
                    100_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToReceiverTx, DEFAULT_COMMITMENT);

                // Verify receiver starts frozen (default state is frozen)
                // Note: After minting with SRFC-37, account should be thawed
                // But we can freeze it again for this test
                const receiverTokenAccount = await getAssociatedTokenAccountAddress(
                    mint.address,
                    receiver.address,
                    TOKEN_2022_PROGRAM_ADDRESS,
                );

                const freezeTx = await getFreezeTransaction({
                    rpc: client.rpc,
                    payer,
                    authority: freezeAuthority,
                    tokenAccount: receiverTokenAccount,
                });
                await sendAndConfirmTransaction(client, freezeTx, DEFAULT_COMMITMENT);

                let frozen = await isAccountFrozen(client.rpc, receiver.address, mint.address);
                expect(frozen).toBe(true);

                // When: Transfer to frozen receiver (should auto-thaw with SRFC-37)
                const transferTx = await createTransferTransaction({
                    rpc: client.rpc,
                    mint: mint.address,
                    from: sender.address,
                    to: receiver.address,
                    feePayer: payer,
                    authority: sender,
                    amount: '200000',
                });

                const signature = await sendAndConfirmTransaction(client, transferTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Transfer succeeded and receiver is thawed
                await assertBalances(
                    client.rpc,
                    [
                        {
                            wallet: sender.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(800_000, 6),
                        },
                        {
                            wallet: receiver.address,
                            mint: mint.address,
                            expectedAmount: decimalAmountToRaw(300_000, 6), // 100k + 200k
                        },
                    ],
                    DEFAULT_COMMITMENT,
                );

                frozen = await isAccountFrozen(client.rpc, receiver.address, mint.address);
                expect(frozen).toBe(false);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should fail zero amount transfer',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();

                // Given: A token with sender having tokens
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Zero Amount Token',
                        symbol: 'ZERO',
                        uri: 'https://example.com/zero.json',
                    },
                    additionalMetadata: new Map(),
                });

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to sender
                const mintToSenderTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToSenderTx, DEFAULT_COMMITMENT);

                // When/Then: Try to transfer zero amount (should fail validation)
                await expect(
                    createTransferTransaction({
                        rpc: client.rpc,
                        mint: mint.address,
                        from: sender.address,
                        to: receiver.address,
                        feePayer: payer,
                        authority: sender,
                        amount: '0',
                    }),
                ).rejects.toThrow('Amount must be a positive number');
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should fail insufficient balance transfer',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();

                // Given: A token with sender having limited tokens
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Insufficient Balance Token',
                        symbol: 'INSUF',
                        uri: 'https://example.com/insuf.json',
                    },
                    additionalMetadata: new Map(),
                });

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint only 100k tokens to sender
                const mintToSenderTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    100_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToSenderTx, DEFAULT_COMMITMENT);

                // When: Try to transfer more than balance
                const transferTx = await createTransferTransaction({
                    rpc: client.rpc,
                    mint: mint.address,
                    from: sender.address,
                    to: receiver.address,
                    feePayer: payer,
                    authority: sender,
                    amount: '200000', // More than the 100k balance
                });

                // Then: Transaction should fail
                await assertTxFailure(client, transferTx);

                // Verify sender balance unchanged
                await assertBalance(client.rpc, sender.address, mint.address, decimalAmountToRaw(100_000, 6));
            },
            DEFAULT_TIMEOUT,
        );
    });
});
