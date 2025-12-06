import setupTestSuite from './setup';
import type { Client } from './setup';
import type { KeyPairSigner, TransactionSigner, Rpc, SolanaRpcApi, Address } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
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
} from './helpers';
import { Token } from '../../issuance';
import { createMintToTransaction, createForceTransferTransaction, createForceBurnTransaction } from '../../management';
import { getFreezeTransaction, getThawTransaction, TOKEN_ACL_PROGRAM_ID } from '../../token-acl';
import { decimalAmountToRaw } from '../../transaction-util';
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';

describeSkipIf()('Management Integration Tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let freezeAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;
    let recipient: KeyPairSigner<string>;

    beforeAll(async () => {
        const testSuite = await setupTestSuite();
        client = testSuite.client;
        mintAuthority = testSuite.mintAuthority;
        freezeAuthority = testSuite.freezeAuthority;
        payer = testSuite.payer;
    });

    beforeEach(async () => {
        mint = await generateKeyPairSigner();
        recipient = await generateKeyPairSigner();
    });

    describe('Minting', () => {
        it(
            'should mint to new wallet (ATA creation)',
            async () => {
                // Given: A token exists
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Test Token',
                        symbol: 'TEST',
                        uri: 'https://example.com/test.json',
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

                // Verify recipient has no tokens initially
                await assertBalance(client.rpc, recipient.address, mint.address, 0n);

                // When: Minting tokens to a new recipient
                const mintTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    recipient.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );

                const mintSig = await sendAndConfirmTransaction(client, mintTx);
                assertTxSuccess(mintSig);

                // Then: Recipient has the minted tokens
                await assertBalance(client.rpc, recipient.address, mint.address, decimalAmountToRaw(1_000_000, 6));
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should mint to existing ATA',
            async () => {
                const testRecipient = await generateKeyPairSigner();
                const initialMintAmount = 1_000_000;
                const secondMintAmount = 500_000;

                // Given: A token with an initial mint to recipient
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Test Token',
                        symbol: 'TEST',
                        uri: 'https://example.com/test.json',
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

                // First mint
                const mintTx1 = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    testRecipient.address,
                    initialMintAmount,
                    mintAuthority,
                    payer,
                );

                await sendAndConfirmTransaction(client, mintTx1, DEFAULT_COMMITMENT);

                await assertBalance(
                    client.rpc,
                    testRecipient.address,
                    mint.address,
                    decimalAmountToRaw(initialMintAmount, 6),
                    DEFAULT_COMMITMENT,
                );

                // When: Minting more tokens to same recipient
                const mintTx2 = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    testRecipient.address,
                    secondMintAmount,
                    mintAuthority,
                    payer,
                );

                const mintSig2 = await sendAndConfirmTransaction(client, mintTx2, DEFAULT_COMMITMENT);
                assertTxSuccess(mintSig2);

                // Then: Recipient has combined balance
                await assertBalance(
                    client.rpc,
                    testRecipient.address,
                    mint.address,
                    decimalAmountToRaw(initialMintAmount + secondMintAmount, 6),
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should handle multiple mint operations to same wallet',
            async () => {
                const amountPerOperation = 1_000_000;

                // Given: A token exists
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Multi Mint Token',
                        symbol: 'MULTI',
                        uri: 'https://example.com/multi.json',
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

                // When: Minting 3 times to the same wallet
                for (let i = 1; i <= 3; i++) {
                    const mintTx = await createMintToTransaction(
                        client.rpc,
                        mint.address,
                        recipient.address,
                        amountPerOperation,
                        mintAuthority,
                        payer,
                    );

                    await sendAndConfirmTransaction(client, mintTx, DEFAULT_COMMITMENT);

                    // Then: Balance increases with each mint
                    await assertBalance(
                        client.rpc,
                        recipient.address,
                        mint.address,
                        decimalAmountToRaw(amountPerOperation * i, 6),
                        DEFAULT_COMMITMENT,
                    );
                }
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should handle tokens of different decimals',
            async () => {
                const testCases = [0, 6, 9];
                const amount = 1_000;

                // Given/When/Then: Create and mint tokens with different decimal places
                await Promise.all(
                    testCases.map(async decimals => {
                        const newMint = await generateKeyPairSigner();

                        // Create token with specific decimals
                        const tokenBuilder = new Token().withMetadata({
                            mintAddress: newMint.address,
                            authority: mintAuthority.address,
                            metadata: {
                                name: `${decimals} Decimal Token`,
                                symbol: `TEST${decimals}DT`,
                                uri: `https://example.com/test${decimals}.json`,
                            },
                            additionalMetadata: new Map(),
                        });

                        const createTx = await tokenBuilder.buildTransaction({
                            rpc: client.rpc,
                            decimals,
                            mintAuthority,
                            freezeAuthority: freezeAuthority.address,
                            mint: newMint,
                            feePayer: payer,
                        });

                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                        // Mint tokens
                        const mintTx = await createMintToTransaction(
                            client.rpc,
                            newMint.address,
                            recipient.address,
                            amount,
                            mintAuthority,
                            payer,
                        );

                        await sendAndConfirmTransaction(client, mintTx, DEFAULT_COMMITMENT);

                        // Verify balance reflects correct decimals
                        await assertBalance(
                            client.rpc,
                            recipient.address,
                            newMint.address,
                            decimalAmountToRaw(amount, decimals),
                            DEFAULT_COMMITMENT,
                        );
                    }),
                );
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Force Transfer', () => {
        it(
            'should force transfer between existing accounts',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with permanent delegate extension
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Force Transfer Token',
                            symbol: 'FTT',
                            uri: 'https://example.com/ftt.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address);

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

                // Mint tokens to receiver to create ATA
                const mintToReceiverTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    receiver.address,
                    500_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintToReceiverTx, DEFAULT_COMMITMENT);

                // When: Force transfer from sender to receiver
                const forceTransferTx = await createForceTransferTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    receiver.address,
                    1_000_000, // Transfer all 1M tokens (decimal amount)
                    permanentDelegate,
                    payer,
                );

                const signature = await sendAndConfirmTransaction(client, forceTransferTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Sender balance is 0, receiver has combined balance
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
                            expectedAmount: decimalAmountToRaw(1_500_000, 6),
                        },
                    ],
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should force transfer with destination ATA creation',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with permanent delegate
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Force Transfer Token',
                            symbol: 'FTT',
                            uri: 'https://example.com/ftt.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address);

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

                // When: Force transfer to receiver (ATA doesn't exist yet)
                const forceTransferTx = await createForceTransferTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    receiver.address,
                    1_000_000, // Transfer all 1M tokens (decimal amount)
                    permanentDelegate,
                    payer,
                );

                const signature = await sendAndConfirmTransaction(client, forceTransferTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Sender has 0, receiver has all tokens (ATA was created)
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
                            expectedAmount: decimalAmountToRaw(1_000_000, 6),
                        },
                    ],
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it.skip(
            'should force transfer with permissionless thaw on destination',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with SRFC-37 enabled (blocklist mode)
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'SRFC37 Force Token',
                            symbol: 'SRFC',
                            uri: 'https://example.com/srfc.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address)
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

                // When: Force transfer to receiver (will create frozen ATA and thaw it)
                const forceTransferTx = await createForceTransferTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    receiver.address,
                    1_000_000, // Transfer all 1M tokens (decimal amount)
                    permanentDelegate,
                    payer,
                );

                const signature = await sendAndConfirmTransaction(client, forceTransferTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Sender has 0, receiver has all tokens (ATA was created frozen and thawed)
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
                            expectedAmount: decimalAmountToRaw(1_000_000, 6),
                        },
                    ],
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should validate permanent delegate authority',
            async () => {
                const sender = await generateKeyPairSigner();
                const receiver = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();
                const wrongDelegate = await generateKeyPairSigner();

                // Given: A token with a specific permanent delegate
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Auth Check Token',
                            symbol: 'AUTH',
                            uri: 'https://example.com/auth.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address);

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

                // When: Try force transfer with wrong delegate
                const forceTransferTx = await createForceTransferTransaction(
                    client.rpc,
                    mint.address,
                    sender.address,
                    receiver.address,
                    1,
                    wrongDelegate,
                    payer,
                );

                // Then: Transaction should fail
                await assertTxFailure(client, forceTransferTx);

                // Verify sender balance unchanged
                await assertBalance(
                    client.rpc,
                    sender.address,
                    mint.address,
                    decimalAmountToRaw(1_000_000, 6),
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Force Burn', () => {
        it(
            'should force burn from wallet with tokens',
            async () => {
                const wallet = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with permanent delegate
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Force Burn Token',
                            symbol: 'FBT',
                            uri: 'https://example.com/fbt.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to wallet
                const mintTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    wallet.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintTx, DEFAULT_COMMITMENT);

                // When: Force burn half the tokens
                const forceBurnTx = await createForceBurnTransaction(
                    client.rpc,
                    mint.address,
                    wallet.address,
                    500_000, // Burn 500k tokens (half of 1M)
                    permanentDelegate,
                    payer,
                );

                const signature = await sendAndConfirmTransaction(client, forceBurnTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Balance is reduced by half
                await assertBalance(
                    client.rpc,
                    wallet.address,
                    mint.address,
                    decimalAmountToRaw(500_000, 6),
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should validate permanent delegate authority',
            async () => {
                const wallet = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();
                const wrongDelegate = await generateKeyPairSigner();

                // Given: A token with a specific permanent delegate
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Burn Auth Token',
                            symbol: 'BAT',
                            uri: 'https://example.com/bat.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // Mint tokens to wallet
                const mintTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    wallet.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );
                await sendAndConfirmTransaction(client, mintTx, DEFAULT_COMMITMENT);

                // When: Try force burn with wrong delegate
                const forceBurnTx = await createForceBurnTransaction(
                    client.rpc,
                    mint.address,
                    wallet.address,
                    0.5,
                    wrongDelegate,
                    payer,
                );

                // Then: Transaction should fail
                await assertTxFailure(client, forceBurnTx);

                // Verify balance unchanged
                await assertBalance(
                    client.rpc,
                    wallet.address,
                    mint.address,
                    decimalAmountToRaw(1_000_000, 6),
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );
    });

    // Helper functions for freeze/thaw tests
    async function setupTokenWithMint(
        freezeAuthorityAddress: Address,
        metadataName: string,
        symbol: string,
        wallet: KeyPairSigner<string>,
    ): Promise<{ wallet: KeyPairSigner<string>; tokenAccount: Address }> {
        const tokenBuilder = new Token().withMetadata({
            mintAddress: mint.address,
            authority: mintAuthority.address,
            metadata: {
                name: metadataName,
                symbol,
                uri: `https://example.com/${symbol.toLowerCase()}.json`,
            },
            additionalMetadata: new Map(),
        });

        const createTx = await tokenBuilder.buildTransaction({
            rpc: client.rpc,
            decimals: 6,
            mintAuthority,
            freezeAuthority: freezeAuthorityAddress,
            mint,
            feePayer: payer,
        });

        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

        const mintTx = await createMintToTransaction(
            client.rpc,
            mint.address,
            wallet.address,
            1_000_000,
            mintAuthority,
            payer,
        );
        await sendAndConfirmTransaction(client, mintTx, DEFAULT_COMMITMENT);

        const [tokenAccount] = await findAssociatedTokenPda({
            owner: wallet.address,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            mint: mint.address,
        });

        return { wallet, tokenAccount };
    }

    async function freezeAndAssert(
        rpc: Rpc<SolanaRpcApi>,
        client: Client,
        payer: TransactionSigner<string>,
        authority: TransactionSigner<string>,
        wallet: KeyPairSigner<string>,
        mint: KeyPairSigner<string>,
        tokenAccount: Address,
    ): Promise<void> {
        const freezeTx = await getFreezeTransaction({
            rpc,
            payer,
            authority,
            tokenAccount,
        });

        const signature = await sendAndConfirmTransaction(client, freezeTx, DEFAULT_COMMITMENT);
        assertTxSuccess(signature);

        const frozen = await isAccountFrozen(rpc, wallet.address, mint.address, DEFAULT_COMMITMENT);
        expect(frozen).toBe(true);
    }

    async function thawAndAssert(
        rpc: Rpc<SolanaRpcApi>,
        client: Client,
        payer: TransactionSigner<string>,
        authority: TransactionSigner<string>,
        wallet: KeyPairSigner<string>,
        mint: KeyPairSigner<string>,
        tokenAccount: Address,
    ): Promise<void> {
        const thawTx = await getThawTransaction({
            rpc,
            payer,
            authority,
            tokenAccount,
        });

        const signature = await sendAndConfirmTransaction(client, thawTx, DEFAULT_COMMITMENT);
        assertTxSuccess(signature);

        const frozen = await isAccountFrozen(rpc, wallet.address, mint.address, DEFAULT_COMMITMENT);
        expect(frozen).toBe(false);
    }

    describe('Pause Operations', () => {
        it.skip(
            'should freeze wallet',
            async () => {
                const wallet = await generateKeyPairSigner();

                // Given: A token with Token ACL as freeze authority
                const { tokenAccount } = await setupTokenWithMint(TOKEN_ACL_PROGRAM_ID, 'Freeze Token', 'FRZ', wallet);

                // Verify not frozen initially
                let frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address, DEFAULT_COMMITMENT);
                expect(frozen).toBe(false);

                // When: Freeze the account
                await freezeAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);
            },
            DEFAULT_TIMEOUT,
        );

        it.skip(
            'should thaw wallet',
            async () => {
                const wallet = await generateKeyPairSigner();

                // Given: A token with Token ACL as freeze authority
                const { tokenAccount } = await setupTokenWithMint(TOKEN_ACL_PROGRAM_ID, 'Thaw Token', 'THW', wallet);

                // Freeze first
                await freezeAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);

                // When: Thaw the account
                await thawAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);
            },
            DEFAULT_TIMEOUT,
        );

        it.skip(
            'should handle freeze then thaw workflow',
            async () => {
                const wallet = await generateKeyPairSigner();

                // Given: A token with Token ACL as freeze authority
                const { tokenAccount } = await setupTokenWithMint(
                    TOKEN_ACL_PROGRAM_ID,
                    'Workflow Token',
                    'WRK',
                    wallet,
                );

                // Initial state: not frozen
                let frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address, DEFAULT_COMMITMENT);
                expect(frozen).toBe(false);

                // When: Freeze the account
                await freezeAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);

                // When: Thaw the account
                await thawAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);

                // Then: Balance unchanged throughout workflow
                await assertBalance(
                    client.rpc,
                    wallet.address,
                    mint.address,
                    decimalAmountToRaw(1_000_000, 6),
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Standard SPL Token-2022 Freeze/Thaw Operations', () => {
        it(
            'should freeze wallet with standard freeze authority',
            async () => {
                const wallet = await generateKeyPairSigner();

                // Given: A token with a standard wallet as freeze authority (not Token ACL)
                const { tokenAccount } = await setupTokenWithMint(
                    freezeAuthority.address,
                    'Standard Freeze Token',
                    'SFRZ',
                    wallet,
                );

                // Verify not frozen initially
                let frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address, DEFAULT_COMMITMENT);
                expect(frozen).toBe(false);

                // When: Freeze the account using standard freeze authority
                await freezeAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should thaw wallet with standard freeze authority',
            async () => {
                const wallet = await generateKeyPairSigner();

                // Given: A token with a standard wallet as freeze authority (not Token ACL)
                const { tokenAccount } = await setupTokenWithMint(
                    freezeAuthority.address,
                    'Standard Thaw Token',
                    'STHW',
                    wallet,
                );

                // Freeze first
                await freezeAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);

                // When: Thaw the account using standard freeze authority
                await thawAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should handle freeze then thaw workflow with standard freeze authority',
            async () => {
                const wallet = await generateKeyPairSigner();

                // Given: A token with a standard wallet as freeze authority (not Token ACL)
                const { tokenAccount } = await setupTokenWithMint(
                    freezeAuthority.address,
                    'Standard Workflow Token',
                    'SWRK',
                    wallet,
                );

                // Initial state: not frozen
                let frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address, DEFAULT_COMMITMENT);
                expect(frozen).toBe(false);

                // When: Freeze the account
                await freezeAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);

                // When: Thaw the account
                await thawAndAssert(client.rpc, client, payer, freezeAuthority, wallet, mint, tokenAccount);

                // Then: Balance unchanged throughout workflow
                await assertBalance(
                    client.rpc,
                    wallet.address,
                    mint.address,
                    decimalAmountToRaw(1_000_000, 6),
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );
    });
});
