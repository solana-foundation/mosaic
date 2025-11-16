import setupTestSuite from './setup';
import type { Client } from './setup';
import type { KeyPairSigner, TransactionSigner } from 'gill';
import { generateKeyPairSigner } from 'gill';
import { sendAndConfirmTransaction, DEFAULT_TIMEOUT, DEFAULT_COMMITMENT, describeSkipIf } from './helpers';
import { Token } from '../../issuance';
import { createMintToTransaction } from '../../management';
import { TOKEN_ACL_PROGRAM_ID } from '../../token-acl';
import {
    inspectToken,
    getTokenMetadata,
    getTokenExtensionsDetailed,
    detectTokenTypeFromMint,
    inspectionResultToDashboardData,
    getTokenDashboardData,
} from '../../inspection';
import { decimalAmountToRaw } from '../../transactionUtil';

describeSkipIf()('Inspection Integration Tests', () => {
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

    describe('Metadata Inspection (getTokenMetadata, getTokenExtensionsDetailed)', () => {
        it(
            'should get token metadata (name, symbol, URI)',
            async () => {
                // Given: A token with metadata
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

                // When: Getting token metadata
                const metadata = await getTokenMetadata(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Metadata is correctly retrieved
                expect(metadata).toBeDefined();
                expect(metadata?.name).toBe('Test Token');
                expect(metadata?.symbol).toBe('TEST');
                expect(metadata?.uri).toBe('https://example.com/test.json');
                expect(metadata?.updateAuthority).toBe(mintAuthority.address);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get token metadata with additional fields',
            async () => {
                // Given: A token with additional metadata
                const additionalMetadata = new Map([
                    ['description', 'A test token'],
                    ['image', 'https://example.com/image.png'],
                    ['external_url', 'https://example.com'],
                ]);

                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Rich Token',
                        symbol: 'RICH',
                        uri: 'https://example.com/rich.json',
                    },
                    additionalMetadata,
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

                const metadata = await getTokenMetadata(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: All metadata fields are present
                expect(metadata).toBeDefined();
                expect(metadata?.additionalMetadata).toBeDefined();
                expect(metadata?.additionalMetadata?.get('description')).toBe('A test token');
                expect(metadata?.additionalMetadata?.get('image')).toBe('https://example.com/image.png');
                expect(metadata?.additionalMetadata?.get('external_url')).toBe('https://example.com');
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get token extensions detailed',
            async () => {
                const permanentDelegate = await generateKeyPairSigner();
                const pausableAuthority = await generateKeyPairSigner();

                // Given: A token with multiple extensions
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Multi Extension Token',
                            symbol: 'MULTI',
                            uri: 'https://example.com/multi.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address)
                    .withPausable(pausableAuthority.address)
                    .withDefaultAccountState(false);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Getting token extensions
                const extensions = await getTokenExtensionsDetailed(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: All extensions are present
                expect(extensions.length).toBeGreaterThanOrEqual(4);

                const extensionNames = extensions.map(ext => ext.name);
                expect(extensionNames).toContain('TokenMetadata');
                expect(extensionNames).toContain('PermanentDelegate');
                expect(extensionNames).toContain('PausableConfig');
                expect(extensionNames).toContain('DefaultAccountState');

                // Verify extension details
                const permanentDelegateExt = extensions.find(ext => ext.name === 'PermanentDelegate');
                expect(permanentDelegateExt?.details?.delegate).toBe(permanentDelegate.address);

                const pausableExt = extensions.find(ext => ext.name === 'PausableConfig');
                expect(pausableExt?.details?.authority).toBe(pausableAuthority.address);
                expect(pausableExt?.details?.paused).toBe(false);
            },
            DEFAULT_TIMEOUT,
        );

        // TODO: Need to resolve whether we keep or modify the detectTokenTypeFromMint function
        it.skip(
            'should detect token type as stablecoin',
            async () => {
                const permanentDelegate = await generateKeyPairSigner();
                const pausableAuthority = await generateKeyPairSigner();
                const confidentialAuthority = await generateKeyPairSigner();

                // Given: A token with stablecoin features
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Stablecoin',
                            symbol: 'STABLE',
                            uri: 'https://example.com/stable.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address)
                    .withPausable(pausableAuthority.address)
                    .withDefaultAccountState(false)
                    .withConfidentialBalances(confidentialAuthority.address);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Detecting token type
                const tokenType = await detectTokenTypeFromMint(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Token is detected as stablecoin
                expect(tokenType).toBe('stablecoin');
            },
            DEFAULT_TIMEOUT,
        );

        // TODO: Need to resolve whether we keep or modify the detectTokenTypeFromMint function
        it.skip(
            'should detect token type as arcade-token',
            async () => {
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with arcade features (no confidential balances)
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Arcade Token',
                            symbol: 'ARCADE',
                            uri: 'https://example.com/arcade.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address)
                    .withDefaultAccountState(true);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 0,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Detecting token type
                const tokenType = await detectTokenTypeFromMint(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Token is detected as arcade-token
                expect(tokenType).toBe('arcade-token');
            },
            DEFAULT_TIMEOUT,
        );

        // TODO: Need to resolve whether we keep or modify the detectTokenTypeFromMint function
        it.skip(
            'should detect token type as tokenized-security',
            async () => {
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with tokenized security features
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Security Token',
                            symbol: 'SEC',
                            uri: 'https://example.com/security.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address)
                    .withDefaultAccountState(false);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx);

                // When: Detecting token type
                const tokenType = await detectTokenTypeFromMint(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Token is detected as tokenized-security
                expect(tokenType).toBe('tokenized-security');
            },
            DEFAULT_TIMEOUT,
        );

        // TODO: Need to resolve whether we keep or modify the detectTokenTypeFromMint function
        it.skip(
            'should detect token type as unknown',
            async () => {
                // Given: A basic token without specific extension patterns
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

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Detecting token type
                const tokenType = await detectTokenTypeFromMint(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Token is detected as unknown
                expect(tokenType).toBe('unknown');
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Authority Inspection', () => {
        it(
            'should get mint authority',
            async () => {
                // Given: A token with mint authority
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Mint Auth Token',
                        symbol: 'MINT',
                        uri: 'https://example.com/mint.json',
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

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Mint authority is correctly identified
                expect(inspection.authorities.mintAuthority).toBe(mintAuthority.address);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get freeze authority',
            async () => {
                // Given: A token with freeze authority
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Freeze Auth Token',
                        symbol: 'FREEZE',
                        uri: 'https://example.com/freeze.json',
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

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Freeze authority is correctly identified
                expect(inspection.authorities.freezeAuthority).toBe(freezeAuthority.address);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get metadata authority',
            async () => {
                // Given: A token with metadata authority
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Metadata Auth Token',
                        symbol: 'META',
                        uri: 'https://example.com/meta.json',
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

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Metadata authority is correctly identified
                expect(inspection.authorities.metadataAuthority).toBe(mintAuthority.address);
                expect(inspection.authorities.updateAuthority).toBe(mintAuthority.address);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get permanent delegate',
            async () => {
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with permanent delegate
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Delegate Token',
                            symbol: 'DEL',
                            uri: 'https://example.com/delegate.json',
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

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Permanent delegate is correctly identified
                expect(inspection.authorities.permanentDelegate).toBe(permanentDelegate.address);
                expect(inspection.authorities.permanentDelegateAuthority).toBe(permanentDelegate.address);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get confidential balances authority',
            async () => {
                const confidentialAuthority = await generateKeyPairSigner();

                // Given: A token with confidential balances
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Confidential Token',
                            symbol: 'CONF',
                            uri: 'https://example.com/conf.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withConfidentialBalances(confidentialAuthority.address);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Confidential authority is correctly identified
                expect(inspection.authorities.confidentialBalancesAuthority).toBe(confidentialAuthority.address);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get pausable authority',
            async () => {
                const pausableAuthority = await generateKeyPairSigner();

                // Given: A pausable token
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Pausable Token',
                            symbol: 'PAUSE',
                            uri: 'https://example.com/pause.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPausable(pausableAuthority.address);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Pausable authority is correctly identified
                expect(inspection.authorities.pausableAuthority).toBe(pausableAuthority.address);
                expect(inspection.isPausable).toBe(true);
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Supply and State', () => {
        it(
            'should get total supply',
            async () => {
                // Given: A token with no minted supply
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Supply Token',
                        symbol: 'SUPPLY',
                        uri: 'https://example.com/supply.json',
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

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Supply is 0
                expect(inspection.supplyInfo.supply).toBe(0n);
                expect(inspection.supplyInfo.decimals).toBe(6);
                expect(inspection.supplyInfo.isInitialized).toBe(true);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get supply after minting',
            async () => {
                const recipient = await generateKeyPairSigner();

                // Given: A token with minted supply
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Minted Token',
                        symbol: 'MINTED',
                        uri: 'https://example.com/minted.json',
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

                // Mint tokens
                const mintTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    recipient.address,
                    1_000_000,
                    mintAuthority,
                    payer,
                );

                await sendAndConfirmTransaction(client, mintTx, DEFAULT_COMMITMENT);

                // When: Inspecting token after mint
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Supply reflects minted amount
                expect(inspection.supplyInfo.supply).toBe(decimalAmountToRaw(1_000_000, 6)); // 1M with 6 decimals
                expect(inspection.supplyInfo.decimals).toBe(6);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get decimals correctly',
            async () => {
                const testCases = [0, 2, 6, 9];

                // Given/When/Then: Test various decimal configurations
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

                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                        // When: Inspecting token
                        const inspection = await inspectToken(client.rpc, testMint.address, DEFAULT_COMMITMENT);

                        // Then: Decimals match
                        expect(inspection.supplyInfo.decimals).toBe(decimals);
                    }),
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should verify token is initialized',
            async () => {
                // Given: A newly created token
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'Init Token',
                        symbol: 'INIT',
                        uri: 'https://example.com/init.json',
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

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Token is initialized
                expect(inspection.supplyInfo.isInitialized).toBe(true);
                expect(inspection.isToken2022).toBe(true);
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Dashboard Data', () => {
        it(
            'should convert inspection result to dashboard data',
            async () => {
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with various features
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Dashboard Token',
                            symbol: 'DASH',
                            uri: 'https://example.com/dash.json',
                        },
                        additionalMetadata: new Map([['description', 'Dashboard test']]),
                    })
                    .withPermanentDelegate(permanentDelegate.address)
                    .withDefaultAccountState(false);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Getting inspection result and converting to dashboard data
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
                const dashboardData = inspectionResultToDashboardData(inspection);

                // Then: Dashboard data is correctly formatted
                expect(dashboardData.name).toBe('Dashboard Token');
                expect(dashboardData.symbol).toBe('DASH');
                expect(dashboardData.address).toBe(mint.address);
                expect(dashboardData.decimals).toBe(6);
                expect(dashboardData.supply).toBe('0');
                expect(dashboardData.uri).toBe('https://example.com/dash.json');
                // TODO: skip until we have a more robust token type detection
                // expect(dashboardData.type).toBe('tokenized-security');
                expect(dashboardData.aclMode).toBe('allowlist');
                expect(dashboardData.mintAuthority).toBe(mintAuthority.address);
                expect(dashboardData.freezeAuthority).toBe(freezeAuthority.address);
                expect(dashboardData.metadataAuthority).toBe(mintAuthority.address);
                expect(dashboardData.permanentDelegateAuthority).toBe(permanentDelegate.address);
                expect(dashboardData.extensions).toContain('TokenMetadata');
                expect(dashboardData.extensions).toContain('PermanentDelegate');
                expect(dashboardData.extensions).toContain('DefaultAccountState');
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should get complete token dashboard data',
            async () => {
                // Given: A stablecoin-like token
                const permanentDelegate = await generateKeyPairSigner();
                const pausableAuthority = await generateKeyPairSigner();
                const confidentialAuthority = await generateKeyPairSigner();

                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Complete Token',
                            symbol: 'COMPLETE',
                            uri: 'https://example.com/complete.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address)
                    .withPausable(pausableAuthority.address)
                    .withDefaultAccountState(false)
                    .withConfidentialBalances(confidentialAuthority.address);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Getting complete dashboard data
                const dashboardData = await getTokenDashboardData(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: All data is present
                expect(dashboardData.name).toBe('Complete Token');
                expect(dashboardData.symbol).toBe('COMPLETE');
                // TODO: skip until we have a more robust token type detection
                // expect(dashboardData.type).toBe('stablecoin');
                expect(dashboardData.aclMode).toBe('allowlist');
                expect(dashboardData.mintAuthority).toBe(mintAuthority.address);
                expect(dashboardData.freezeAuthority).toBe(freezeAuthority.address);
                expect(dashboardData.permanentDelegateAuthority).toBe(permanentDelegate.address);
                expect(dashboardData.pausableAuthority).toBe(pausableAuthority.address);
                expect(dashboardData.confidentialBalancesAuthority).toBe(confidentialAuthority.address);
                expect(dashboardData.extensions).toContain('TokenMetadata');
                expect(dashboardData.extensions).toContain('PermanentDelegate');
                expect(dashboardData.extensions).toContain('PausableConfig');
                expect(dashboardData.extensions).toContain('DefaultAccountState');
                expect(dashboardData.extensions).toContain('ConfidentialTransferMint');
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should handle scaled UI amount in dashboard data',
            async () => {
                const scaledAuthority = await generateKeyPairSigner();
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with scaled UI amount
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Scaled Token',
                            symbol: 'SCALE',
                            uri: 'https://example.com/scale.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withPermanentDelegate(permanentDelegate.address)
                    .withDefaultAccountState(false)
                    .withScaledUiAmount(scaledAuthority.address, 100, 0, 100);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Getting dashboard data
                const dashboardData = await getTokenDashboardData(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: Scaled UI amount is present
                expect(dashboardData.multiplier).toBe(100);
                expect(dashboardData.extensions).toContain('ScaledUiAmountConfig');
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('ACL Mode Detection', () => {
        it(
            'should detect allowlist mode (frozen by default)',
            async () => {
                // Given: A token with default account state frozen
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Allowlist Token',
                            symbol: 'ALLOW',
                            uri: 'https://example.com/allow.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withDefaultAccountState(false); // false = frozen = allowlist

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: ACL mode is allowlist
                expect(inspection.aclMode).toBe('allowlist');
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should detect blocklist mode (initialized by default)',
            async () => {
                // Given: A token with default account state initialized
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Blocklist Token',
                            symbol: 'BLOCK',
                            uri: 'https://example.com/block.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withDefaultAccountState(true); // true = initialized = blocklist

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: ACL mode is blocklist
                expect(inspection.aclMode).toBe('blocklist');
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should detect no ACL (no default account state)',
            async () => {
                // Given: A token without default account state extension
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: {
                        name: 'No ACL Token',
                        symbol: 'NOACL',
                        uri: 'https://example.com/noacl.json',
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

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: ACL mode is none
                expect(inspection.aclMode).toBe('none');
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should detect SRFC-37 enabled',
            async () => {
                // Given: A token with Token ACL as freeze authority
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'SRFC37 Token',
                            symbol: 'SRFC',
                            uri: 'https://example.com/srfc.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withDefaultAccountState(false);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: SRFC-37 is enabled
                expect(inspection.enableSrfc37).toBe(true);
                expect(inspection.authorities.freezeAuthority).toBe(TOKEN_ACL_PROGRAM_ID);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should detect SRFC-37 disabled',
            async () => {
                // Given: A token without Token ACL as freeze authority
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'No SRFC Token',
                            symbol: 'NOSRFC',
                            uri: 'https://example.com/nosrfc.json',
                        },
                        additionalMetadata: new Map(),
                    })
                    .withDefaultAccountState(false);

                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });

                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

                // When: Inspecting token
                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

                // Then: SRFC-37 is disabled
                expect(inspection.enableSrfc37).toBe(false);
                expect(inspection.authorities.freezeAuthority).not.toBe(TOKEN_ACL_PROGRAM_ID);
            },
            DEFAULT_TIMEOUT,
        );
    });
});
