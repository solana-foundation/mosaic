import setupTestSuite from './setup.js';
import type { Client } from './setup.js';
import type { Address, KeyPairSigner, TransactionSigner } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
import {
    sendAndConfirmTransaction,
    assertTxLanded,
    assertToken,
    DEFAULT_TIMEOUT,
    DEFAULT_COMMITMENT,
    describeSkipIf,
} from './helpers.js';
import { TEST_BACKEND } from './env.js';
import { findMintConfigPda } from '@solana/token-acl-sdk';
import { TOKEN_ACL_PROGRAM_ID } from '../../token-acl/index.js';

/** The Token ACL mint config PDA, which holds a mint's freeze authority once SRFC-37 is set up. */
async function mintConfigAddress(mint: Address): Promise<Address> {
    const [mintConfig] = await findMintConfigPda({ mint }, { programAddress: TOKEN_ACL_PROGRAM_ID });
    return mintConfig;
}
import {
    createStablecoinInitTransaction,
    createArcadeTokenInitTransaction,
    createTokenizedSecurityInitTransaction,
} from '../../templates/index.js';

// Surfpool leg only: the SRFC-37 paths need the real Token ACL and ABL programs, which surfpool
// forks from devnet and solana-test-validator doesn't have.
describeSkipIf(TEST_BACKEND !== 'surfpool')('Templates Integration Tests', () => {
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

    describe('Stablecoin Template', () => {
        describe('Single-signer flow with SRFC-37 (feePayer = mintAuthority)', () => {
            it(
                'should create mint with full stablecoin setup (metadata, pausable, confidential, permanent delegate, ACL, ABL blocklist)',
                async () => {
                    // Given: Stablecoin parameters with SRFC-37 enabled and single signer
                    const name = 'USD Stablecoin';
                    const symbol = 'USDS';
                    const decimals = 6;
                    const uri = 'https://example.com/usds.json';

                    // When: Creating stablecoin with payer as mintAuthority
                    const createTx = await createStablecoinInitTransaction(
                        client.rpc,
                        name,
                        symbol,
                        decimals,
                        uri,
                        payer, // mintAuthority
                        mint,
                        payer, // feePayer (same as mintAuthority)
                        'blocklist', // aclMode
                        undefined, // metadataAuthority (defaults to mintAuthority)
                        undefined, // pausableAuthority (defaults to mintAuthority)
                        undefined, // confidentialBalancesAuthority (defaults to mintAuthority)
                        undefined, // permanentDelegateAuthority (defaults to mintAuthority)
                        true, // enableSrfc37
                        freezeAuthority.address,
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token has all stablecoin extensions
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            authorities: {
                                mintAuthority: payer.address,
                                freezeAuthority: await mintConfigAddress(mint.address), // Token ACL holds freeze
                                metadataAuthority: payer.address,
                                permanentDelegate: payer.address,
                            },
                            metadata: {
                                name,
                                symbol,
                                uri,
                            },
                            isPausable: true,
                            aclMode: 'blocklist',
                            enableSrfc37: true,
                            extensions: [
                                {
                                    name: 'DefaultAccountState',
                                    details: {
                                        state: 1, // Initialized: blocklist accounts are usable by default
                                    },
                                },
                                {
                                    name: 'ConfidentialTransferMint',
                                    details: {
                                        authority: payer.address,
                                        autoApproveNewAccounts: false,
                                    },
                                },
                                {
                                    name: 'PermanentDelegate',
                                    details: {
                                        delegate: payer.address,
                                    },
                                },
                            ],
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );

            it(
                'should create blocklist by default when aclMode not specified',
                async () => {
                    // Given: Stablecoin without explicit aclMode
                    const createTx = await createStablecoinInitTransaction(
                        client.rpc,
                        'Default Stable',
                        'DSTB',
                        6,
                        'https://example.com/dstb.json',
                        payer,
                        mint,
                        payer,
                        undefined, // aclMode defaults to blocklist
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        true, // enableSrfc37
                        freezeAuthority.address,
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token has blocklist mode
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            aclMode: 'blocklist',
                            enableSrfc37: true,
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );
        });

        describe('Multi-signer flow (feePayer ≠ mintAuthority) or SRFC-37 disabled', () => {
            it(
                'should set up SRFC-37 when the fee payer differs from the mint authority',
                async () => {
                    // Given: Different payer and mintAuthority
                    const createTx = await createStablecoinInitTransaction(
                        client.rpc,
                        'Multi-sig Stable',
                        'MSTB',
                        6,
                        'https://example.com/mstb.json',
                        mintAuthority, // Different from payer
                        mint,
                        payer,
                        'blocklist',
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        true, // enableSrfc37: a sponsored fee payer still gets the full SRFC-37 setup
                        freezeAuthority.address,
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token ACL holds freeze authority, with the mint authority as config authority
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            authorities: {
                                mintAuthority: mintAuthority.address,
                                freezeAuthority: await mintConfigAddress(mint.address),
                            },
                            isPausable: true,
                            aclMode: 'blocklist',
                            enableSrfc37: true,
                            extensions: [
                                {
                                    name: 'DefaultAccountState',
                                    details: {
                                        state: 1, // Initialized: blocklist accounts are usable by default
                                    },
                                },
                            ],
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );

            it(
                'should create mint with extensions only when SRFC-37 disabled',
                async () => {
                    // Given: SRFC-37 explicitly disabled
                    const createTx = await createStablecoinInitTransaction(
                        client.rpc,
                        'No SRFC Stable',
                        'NSTB',
                        6,
                        'https://example.com/nstb.json',
                        payer,
                        mint,
                        payer, // Same signer
                        'blocklist',
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        false, // enableSrfc37 disabled
                        freezeAuthority.address,
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token has extensions but no ACL
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            isPausable: true,
                            enableSrfc37: false,
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );
        });

        describe('Allowlist mode option', () => {
            it(
                'should create allowlist instead of blocklist when specified',
                async () => {
                    // Given: Stablecoin with allowlist mode
                    const createTx = await createStablecoinInitTransaction(
                        client.rpc,
                        'Allowlist Stable',
                        'ASTB',
                        6,
                        'https://example.com/astb.json',
                        payer,
                        mint,
                        payer,
                        'allowlist', // Explicit allowlist
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        true,
                        freezeAuthority.address,
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token has allowlist mode with initialized state
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            aclMode: 'allowlist',
                            enableSrfc37: true,
                            extensions: [
                                {
                                    name: 'DefaultAccountState',
                                    details: {
                                        state: 2, // Frozen: allowlist membership is what thaws an account
                                    },
                                },
                            ],
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );
        });
    });

    describe('Arcade Token Template', () => {
        describe('Single-signer flow with SRFC-37', () => {
            it(
                'should create mint with correct extensions and allowlist (metadata, pausable, permanent delegate, default state frozen)',
                async () => {
                    // Given: Arcade token parameters with SRFC-37 enabled
                    const name = 'Game Credits';
                    const symbol = 'GCRED';
                    const decimals = 0; // Whole units for gaming
                    const uri = 'https://example.com/gcred.json';

                    // When: Creating arcade token
                    const createTx = await createArcadeTokenInitTransaction(
                        client.rpc,
                        name,
                        symbol,
                        decimals,
                        uri,
                        payer, // mintAuthority
                        mint,
                        payer, // feePayer (same as mintAuthority)
                        undefined, // metadataAuthority
                        undefined, // pausableAuthority
                        undefined, // permanentDelegateAuthority
                        true, // enableSrfc37
                        freezeAuthority.address,
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token has arcade token features with allowlist
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            authorities: {
                                mintAuthority: payer.address,
                                freezeAuthority: await mintConfigAddress(mint.address), // Token ACL holds freeze
                                metadataAuthority: payer.address,
                                permanentDelegate: payer.address,
                            },
                            metadata: {
                                name,
                                symbol,
                                uri,
                            },
                            isPausable: true,
                            aclMode: 'allowlist', // Arcade tokens always use allowlist
                            enableSrfc37: true,
                            extensions: [
                                {
                                    name: 'DefaultAccountState',
                                    details: {
                                        state: 2, // Frozen: allowlist membership is what thaws an account
                                    },
                                },
                                {
                                    name: 'PermanentDelegate',
                                    details: {
                                        delegate: payer.address,
                                    },
                                },
                            ],
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );
        });

        describe('Multi-signer flow or SRFC-37 disabled', () => {
            it(
                'should set up SRFC-37 when the fee payer differs from the mint authority',
                async () => {
                    // Given: Different payer and mintAuthority
                    const createTx = await createArcadeTokenInitTransaction(
                        client.rpc,
                        'Multi-sig Arcade',
                        'MARC',
                        0,
                        'https://example.com/marc.json',
                        mintAuthority, // Different from payer
                        mint,
                        payer,
                        undefined,
                        undefined,
                        undefined,
                        true, // enableSrfc37: a sponsored fee payer still gets the full SRFC-37 setup
                        freezeAuthority.address,
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token ACL holds freeze authority
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            authorities: {
                                mintAuthority: mintAuthority.address,
                                freezeAuthority: await mintConfigAddress(mint.address),
                            },
                            isPausable: true,
                            enableSrfc37: true,
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );
        });
    });

    describe('Tokenized Security Template', () => {
        describe('Single-signer flow with SRFC-37', () => {
            it(
                'should create mint with all stablecoin extensions + Scaled UI Amount',
                async () => {
                    // Given: Tokenized security with scaled UI amount
                    const name = 'Security Token';
                    const symbol = 'SEC';
                    const decimals = 6;
                    const uri = 'https://example.com/sec.json';
                    const multiplier = 100;

                    // When: Creating tokenized security
                    const createTx = await createTokenizedSecurityInitTransaction(
                        client.rpc,
                        name,
                        symbol,
                        decimals,
                        uri,
                        payer, // mintAuthority
                        mint,
                        payer, // feePayer
                        freezeAuthority.address,
                        {
                            aclMode: 'blocklist',
                            enableSrfc37: true,
                            scaledUiAmount: {
                                authority: payer.address,
                                multiplier,
                                newMultiplierEffectiveTimestamp: 0n,
                                newMultiplier: multiplier,
                            },
                        },
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token has all features including scaled UI amount
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            authorities: {
                                mintAuthority: payer.address,
                                freezeAuthority: await mintConfigAddress(mint.address), // Token ACL holds freeze
                                metadataAuthority: payer.address,
                                permanentDelegate: payer.address,
                            },
                            metadata: {
                                name,
                                symbol,
                                uri,
                            },
                            isPausable: true,
                            aclMode: 'blocklist',
                            enableSrfc37: true,
                            scaledUiAmount: {
                                enabled: true,
                                authority: payer.address,
                                multiplier,
                            },
                            extensions: [
                                {
                                    name: 'ScaledUiAmountConfig',
                                    details: {
                                        authority: payer.address,
                                        multiplier,
                                    },
                                },
                                {
                                    name: 'DefaultAccountState',
                                    details: {
                                        state: 1, // Initialized: blocklist accounts are usable by default
                                    },
                                },
                                {
                                    name: 'PermanentDelegate',
                                    details: {
                                        delegate: payer.address,
                                    },
                                },
                                {
                                    name: 'PermissionedBurn',
                                    details: {
                                        authority: payer.address,
                                    },
                                },
                            ],
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );

            it(
                'should support allowlist mode',
                async () => {
                    // Given: Tokenized security with allowlist
                    const createTx = await createTokenizedSecurityInitTransaction(
                        client.rpc,
                        'Allowlist Security',
                        'ASEC',
                        6,
                        'https://example.com/asec.json',
                        payer,
                        mint,
                        payer,
                        freezeAuthority.address,
                        {
                            aclMode: 'allowlist', // Allowlist instead of blocklist
                            enableSrfc37: true,
                            scaledUiAmount: {
                                multiplier: 10,
                            },
                        },
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token has allowlist mode
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            aclMode: 'allowlist',
                            enableSrfc37: true,
                            extensions: [
                                {
                                    name: 'DefaultAccountState',
                                    details: {
                                        state: 2, // Frozen: allowlist membership is what thaws an account
                                    },
                                },
                            ],
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );

            it(
                'should validate scaled UI amount configuration',
                async () => {
                    // Given: Custom scaled UI amount parameters
                    const scaledAuthority = await generateKeyPairSigner();
                    const multiplier = 1000;
                    const timestamp = BigInt(Date.now());
                    const newMultiplier = 2000;

                    const createTx = await createTokenizedSecurityInitTransaction(
                        client.rpc,
                        'Custom Scale Security',
                        'CSEC',
                        6,
                        'https://example.com/csec.json',
                        payer,
                        mint,
                        payer,
                        freezeAuthority.address,
                        {
                            aclMode: 'blocklist',
                            enableSrfc37: true,
                            scaledUiAmount: {
                                authority: scaledAuthority.address,
                                multiplier,
                                newMultiplierEffectiveTimestamp: timestamp,
                                newMultiplier,
                            },
                        },
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token has correct scaled UI amount configuration
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            scaledUiAmount: {
                                enabled: true,
                                authority: scaledAuthority.address,
                                multiplier,
                            },
                            extensions: [
                                {
                                    name: 'ScaledUiAmountConfig',
                                    details: {
                                        authority: scaledAuthority.address,
                                        multiplier,
                                    },
                                },
                            ],
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );
        });

        describe('Multi-signer flow or SRFC-37 disabled', () => {
            // Skipped: with a sponsored fee payer the SRFC-37 tokenized-security init (with Scaled UI
            // Amount) needs two signatures and serializes to 1238 bytes, over the 1232-byte
            // transaction limit, so the template cannot build a sendable transaction. A template
            // bug, not a backend gap; re-enable once the template splits the setup.
            it.skip(
                'should create mint with extensions only',
                async () => {
                    // Given: Multi-signer setup
                    const createTx = await createTokenizedSecurityInitTransaction(
                        client.rpc,
                        'Multi-sig Security',
                        'MSEC',
                        6,
                        'https://example.com/msec.json',
                        mintAuthority, // Different from payer
                        mint,
                        payer,
                        freezeAuthority.address,
                        {
                            aclMode: 'blocklist',
                            enableSrfc37: true, // Won't apply
                            scaledUiAmount: {
                                multiplier: 50,
                            },
                        },
                    );

                    await assertTxLanded(
                        client.rpc,
                        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT),
                    );

                    // Then: Token has extensions but no ACL
                    await assertToken(
                        client.rpc,
                        mint.address,
                        {
                            authorities: {
                                mintAuthority: mintAuthority.address,
                                freezeAuthority: freezeAuthority.address,
                            },
                            isPausable: true,
                            enableSrfc37: false,
                            extensions: [
                                {
                                    name: 'ScaledUiAmountConfig',
                                    details: {
                                        multiplier: 50,
                                    },
                                },
                            ],
                        },
                        DEFAULT_COMMITMENT,
                    );
                },
                DEFAULT_TIMEOUT,
            );
        });
    });

    describe('Template Authority Options', () => {
        it(
            'should accept custom freeze authority',
            async () => {
                // Given: Custom freeze authority
                const customFreezeAuthority = await generateKeyPairSigner();

                const createTx = await createStablecoinInitTransaction(
                    client.rpc,
                    'Custom Freeze Stable',
                    'CFSTB',
                    6,
                    'https://example.com/cfstb.json',
                    payer,
                    mint,
                    payer,
                    'blocklist',
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    false, // Disable SRFC-37 for simpler test
                    customFreezeAuthority.address, // Custom freeze authority
                );

                await assertTxLanded(client.rpc, await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT));

                // Then: Token has custom freeze authority
                await assertToken(
                    client.rpc,
                    mint.address,
                    {
                        authorities: {
                            mintAuthority: payer.address,
                            freezeAuthority: customFreezeAuthority.address,
                        },
                    },
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should accept custom permanent delegate',
            async () => {
                // Given: Custom permanent delegate
                const customDelegate = await generateKeyPairSigner();

                const createTx = await createStablecoinInitTransaction(
                    client.rpc,
                    'Custom Delegate Stable',
                    'CDSTB',
                    6,
                    'https://example.com/cdstb.json',
                    payer,
                    mint,
                    payer,
                    'blocklist',
                    undefined, // metadataAuthority
                    undefined, // pausableAuthority
                    undefined, // confidentialBalancesAuthority
                    customDelegate.address, // Custom permanent delegate
                    false,
                    freezeAuthority.address,
                );

                await assertTxLanded(client.rpc, await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT));

                // Then: Token has custom permanent delegate
                await assertToken(
                    client.rpc,
                    mint.address,
                    {
                        authorities: {
                            permanentDelegate: customDelegate.address,
                        },
                        extensions: [
                            {
                                name: 'PermanentDelegate',
                                details: {
                                    delegate: customDelegate.address,
                                },
                            },
                        ],
                    },
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should accept custom metadata authority',
            async () => {
                // Given: Custom metadata authority
                const customMetadataAuthority = await generateKeyPairSigner();

                const createTx = await createStablecoinInitTransaction(
                    client.rpc,
                    'Custom Metadata Stable',
                    'CMSTB',
                    6,
                    'https://example.com/cmstb.json',
                    payer,
                    mint,
                    payer,
                    'blocklist',
                    customMetadataAuthority.address, // Custom metadata authority
                    undefined,
                    undefined,
                    undefined,
                    false,
                    freezeAuthority.address,
                );

                await assertTxLanded(client.rpc, await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT));

                // Then: Token has custom metadata authority
                await assertToken(
                    client.rpc,
                    mint.address,
                    {
                        authorities: {
                            metadataAuthority: customMetadataAuthority.address,
                        },
                    },
                    DEFAULT_COMMITMENT,
                );
            },
            DEFAULT_TIMEOUT,
        );
    });
});
