import setupTestSuite from './setup';
import type { Client } from './setup';
import type { KeyPairSigner, TransactionSigner } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
import {
    sendAndConfirmTransaction,
    assertTxSuccess,
    assertToken,
    DEFAULT_TIMEOUT,
    DEFAULT_COMMITMENT,
    describeSkipIf,
} from './helpers';
import { Token } from '../../issuance';

describeSkipIf()('Issuance Integration Tests', () => {
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

    describe('Basic Token Creation', () => {
        it(
            'should create minimal token without metadata',
            async () => {
                // Given: A bare token builder with no extensions
                const tokenBuilder = new Token();

                // When: Building and executing transaction
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token exists with only core authorities (no metadata)
                await assertToken(client.rpc, mint.address, {
                    authorities: {
                        mintAuthority: mintAuthority.address,
                        freezeAuthority: freezeAuthority.address,
                    },
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create token with metadata only',
            async () => {
                // Given: A token builder with metadata
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Basic Token',
                        symbol: 'BASIC',
                        uri: 'https://example.com/basic.json',
                    },
                    additionalMetadata: new Map(),
                });

                // When: Building and executing transaction
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token exists with correct authorities
                await assertToken(client.rpc, mint.address, {
                    authorities: {
                        mintAuthority: mintAuthority.address,
                        freezeAuthority: freezeAuthority.address,
                        metadataAuthority: mintAuthority.address,
                    },
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create token with different decimal places',
            async () => {
                const testCases = [0, 2, 6, 9];

                // Given/When/Then: Create tokens with various decimal places
                await Promise.all(
                    testCases.map(async decimals => {
                        const testMint = await generateKeyPairSigner();

                        const tokenBuilder = new Token().withMetadata({
                            mintAddress: testMint.address,
                            authority: mintAuthority.address,
                            metadata: {
                                name: `${decimals} Decimal Token`,
                                symbol: `DEC${decimals}`,
                                uri: `https://example.com/dec${decimals}.json`,
                            },
                            additionalMetadata: new Map(),
                        });

                        const createTx = await tokenBuilder.buildTransaction({
                            rpc: client.rpc,
                            decimals,
                            mintAuthority,
                            freezeAuthority: freezeAuthority.address,
                            mint: testMint,
                            feePayer: payer,
                        });

                        const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                        assertTxSuccess(signature);

                        // Verify token was created
                        await assertToken(client.rpc, testMint.address, {
                            authorities: {
                                mintAuthority: mintAuthority.address,
                            },
                        });
                    }),
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create token with additional metadata fields',
            async () => {
                // Given: A token with custom metadata fields
                const additionalMetadata = new Map([
                    ['description', 'A test token with extra fields'],
                    ['image', 'https://example.com/image.png'],
                    ['external_url', 'https://example.com'],
                ]);

                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Rich Metadata Token',
                        symbol: 'RICH',
                        uri: 'https://example.com/rich.json',
                    },
                    additionalMetadata,
                });

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token exists with metadata extension
                await assertToken(client.rpc, mint.address, {
                    extensions: [
                        {
                            name: 'MetadataPointer',
                            details: {
                                authority: mintAuthority.address,
                                metadataAddress: mint.address,
                            },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Token Extensions', () => {
        it(
            'should create token with permanent delegate',
            async () => {
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with permanent delegate extension
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Delegate Token',
                            symbol: 'DELEG',
                            uri: 'https://example.com/delegate.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address);

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token has permanent delegate extension
                await assertToken(client.rpc, mint.address, {
                    authorities: {
                        permanentDelegate: permanentDelegate.address,
                    },
                    extensions: [
                        {
                            name: 'PermanentDelegate',
                            details: {
                                delegate: permanentDelegate.address,
                            },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create pausable token',
            async () => {
                const pausableAuthority = await generateKeyPairSigner();

                // Given: A token with pausable extension
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Pausable Token',
                            symbol: 'PAUSE',
                            uri: 'https://example.com/pausable.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPausable(pausableAuthority.address);

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token is pausable
                await assertToken(client.rpc, mint.address, {
                    isPausable: true,
                    extensions: [
                        {
                            name: 'PausableConfig',
                            details: {
                                authority: pausableAuthority.address,
                                paused: false,
                            },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create token with default account state (initialized)',
            async () => {
                // Given: A token with default account state set to initialized
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Allowlist Token',
                            symbol: 'ALLOW',
                            uri: 'https://example.com/allowlist.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withDefaultAccountState(true); // true = initialized

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token has default account state extension
                await assertToken(client.rpc, mint.address, {
                    extensions: [
                        {
                            name: 'DefaultAccountState',
                            details: {
                                state: 1, // Initialized
                            },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create token with default account state (frozen)',
            async () => {
                // Given: A token with default account state set to frozen
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Blocklist Token',
                            symbol: 'BLOCK',
                            uri: 'https://example.com/blocklist.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withDefaultAccountState(false); // false = frozen

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token has default account state extension (frozen)
                await assertToken(client.rpc, mint.address, {
                    extensions: [
                        {
                            name: 'DefaultAccountState',
                            details: {
                                state: 2, // Frozen
                            },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create token with confidential balances',
            async () => {
                const confidentialAuthority = await generateKeyPairSigner();

                // Given: A token with confidential balances extension
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Confidential Token',
                            symbol: 'CONF',
                            uri: 'https://example.com/confidential.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withConfidentialBalances(confidentialAuthority.address);

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token has confidential transfer extension
                await assertToken(client.rpc, mint.address, {
                    extensions: [
                        {
                            name: 'ConfidentialTransferMint',
                            details: {
                                authority: confidentialAuthority.address,
                                autoApproveNewAccounts: false,
                            },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create token with scaled UI amount',
            async () => {
                const scaledAuthority = await generateKeyPairSigner();

                // Given: A token with scaled UI amount extension
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Scaled Token',
                            symbol: 'SCALE',
                            uri: 'https://example.com/scaled.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withScaledUiAmount(
                        scaledAuthority.address,
                        100, // multiplier
                        0, // effective timestamp
                        100, // new multiplier
                    );

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token has scaled UI amount extension
                await assertToken(client.rpc, mint.address, {
                    extensions: [
                        {
                            name: 'ScaledUiAmountConfig',
                            details: {
                                authority: scaledAuthority.address,
                                multiplier: 100,
                            },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Complex Token Configurations', () => {
        it(
            'should create stablecoin-like token (blocklist + confidential + pausable + permanent delegate)',
            async () => {
                const pausableAuthority = await generateKeyPairSigner();
                const confidentialAuthority = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with stablecoin-like features
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Stablecoin',
                            symbol: 'STABLE',
                            uri: 'https://example.com/stablecoin.json',
                        },
                        additionalMetadata: new Map([
                            ['description', 'USD-pegged stablecoin'],
                            ['image', 'https://example.com/stable.png'],
                        ]),
                    })
                    .withDefaultAccountState(false) // Frozen by default (blocklist)
                    .withConfidentialBalances(confidentialAuthority.address)
                    .withPausable(pausableAuthority.address)
                    .withPermanentDelegate(permanentDelegate.address);

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token has all stablecoin features
                await assertToken(client.rpc, mint.address, {
                    authorities: {
                        mintAuthority: mintAuthority.address,
                        freezeAuthority: freezeAuthority.address,
                        permanentDelegate: permanentDelegate.address,
                        metadataAuthority: mintAuthority.address,
                    },
                    isPausable: true,
                    extensions: [
                        {
                            name: 'DefaultAccountState',
                            details: {
                                state: 2, // Frozen
                            },
                        },
                        {
                            name: 'PermanentDelegate',
                            details: {
                                delegate: permanentDelegate.address,
                            },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create arcade token (allowlist + pausable + permanent delegate)',
            async () => {
                const pausableAuthority = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with arcade/gaming features
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Arcade Credits',
                            symbol: 'ARCADE',
                            uri: 'https://example.com/arcade.json',
                        },
                        additionalMetadata: new Map([
                            ['description', 'In-game currency for arcade'],
                            ['game_id', 'arcade-game-123'],
                            ['type', 'in-game-currency'],
                        ]),
                    })
                    .withDefaultAccountState(true) // Initialized by default (allowlist)
                    .withPausable(pausableAuthority.address)
                    .withPermanentDelegate(permanentDelegate.address);

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 0, // Whole units only for gaming
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token has all arcade features
                await assertToken(client.rpc, mint.address, {
                    authorities: {
                        mintAuthority: mintAuthority.address,
                        permanentDelegate: permanentDelegate.address,
                    },
                    isPausable: true,
                    extensions: [
                        {
                            name: 'DefaultAccountState',
                            details: {
                                state: 1, // Initialized
                            },
                        },
                        {
                            name: 'PermanentDelegate',
                            details: {
                                delegate: permanentDelegate.address,
                            },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create token with all extensions',
            async () => {
                const pausableAuthority = await generateKeyPairSigner();
                const confidentialAuthority = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();
                const scaledAuthority = await generateKeyPairSigner();

                // Given: A token with every possible extension
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Full Feature Token',
                            symbol: 'FULL',
                            uri: 'https://example.com/full.json',
                        },
                        additionalMetadata: new Map([['feature', 'complete']]),
                    })
                    .withPermanentDelegate(permanentDelegate.address)
                    .withPausable(pausableAuthority.address)
                    .withDefaultAccountState(false)
                    .withConfidentialBalances(confidentialAuthority.address)
                    .withScaledUiAmount(scaledAuthority.address, 10, 0, 10);

                // When: Creating the token
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Token has all extensions
                await assertToken(client.rpc, mint.address, {
                    authorities: {
                        mintAuthority: mintAuthority.address,
                        freezeAuthority: freezeAuthority.address,
                        permanentDelegate: permanentDelegate.address,
                        metadataAuthority: mintAuthority.address,
                    },
                    isPausable: true,
                });
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Authority Variations', () => {
        it(
            'should create token with feePayer as default authorities',
            async () => {
                // Given: A token builder without explicit authorities
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: payer.address,
                    metadata: {
                        name: 'Default Auth Token',
                        symbol: 'DEFAULT',
                        uri: 'https://example.com/default.json',
                    },
                    additionalMetadata: new Map(),
                });

                // When: Building transaction without mintAuthority or freezeAuthority
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: FeePayer is set as both authorities
                await assertToken(client.rpc, mint.address, {
                    authorities: {
                        mintAuthority: payer.address,
                        freezeAuthority: payer.address,
                        metadataAuthority: payer.address,
                    },
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should create token with separate authorities',
            async () => {
                const metadataAuthority = await generateKeyPairSigner();
                const separateMintAuthority = await generateKeyPairSigner();
                const separateFreezeAuthority = await generateKeyPairSigner();

                // Given: A token with different authorities for each role
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: metadataAuthority.address,
                    metadata: {
                        name: 'Multi Auth Token',
                        symbol: 'MULTI',
                        uri: 'https://example.com/multi.json',
                    },
                    additionalMetadata: new Map(),
                });

                // When: Creating with distinct authorities
                // Note: mintAuthority must be a signer when metadata is present
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority: separateMintAuthority,
                    freezeAuthority: separateFreezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                const signature = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(signature);

                // Then: Each authority is set correctly
                await assertToken(client.rpc, mint.address, {
                    authorities: {
                        mintAuthority: separateMintAuthority.address,
                        freezeAuthority: separateFreezeAuthority.address,
                        metadataAuthority: metadataAuthority.address,
                    },
                });
            },
            DEFAULT_TIMEOUT,
        );
    });
});
