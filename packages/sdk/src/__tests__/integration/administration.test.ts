import setupTestSuite from './setup.js';
import type { Client } from './setup.js';
import type { KeyPairSigner, TransactionSigner } from '@solana/kit';
import { generateKeyPairSigner, lamports } from '@solana/kit';
import { AuthorityType } from '@solana-program/token-2022';
import {
    sendAndConfirmTransaction,
    assertTxSuccess,
    assertTxFailure,
    DEFAULT_TIMEOUT,
    DEFAULT_COMMITMENT,
    assertToken,
    describeSkipIf,
} from './helpers.js';
import { Token } from '../../issuance/index.js';
import { createMintToTransaction } from '../../management/index.js';
import {
    getUpdateAuthorityTransaction,
    getRemoveAuthorityTransaction,
    createUpdateMetadataTransaction,
} from '../../administration/index.js';

describeSkipIf()('Administration Integration Tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let freezeAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;
    let newAuthority: KeyPairSigner<string>;

    beforeAll(async () => {
        const testSuite = await setupTestSuite();
        client = testSuite.client;
        mintAuthority = testSuite.mintAuthority;
        freezeAuthority = testSuite.freezeAuthority;
        payer = testSuite.payer;
    });

    beforeEach(async () => {
        mint = await generateKeyPairSigner();
        newAuthority = await generateKeyPairSigner();
    });

    describe('Update Authorities', () => {
        it(
            'should transfer mint authority',
            async () => {
                // Given: A token with mint authority
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

                const createSig = await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                assertTxSuccess(createSig);

                await assertToken(client.rpc, mint.address, {
                    authorities: { mintAuthority: mintAuthority.address },
                });

                // When: Transferring mint authority to new address
                const updateTx = await getUpdateAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: AuthorityType.MintTokens,
                    currentAuthority: mintAuthority,
                    newAuthority: newAuthority.address,
                });

                const updateSig = await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT);
                assertTxSuccess(updateSig);

                // Then: New authority is set
                await assertToken(client.rpc, mint.address, {
                    authorities: { mintAuthority: newAuthority.address },
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should transfer freeze authority',
            async () => {
                // Given: A token with freeze authority
                const tokenBuilder = new Token().withMetadata({
                    mintAddress: mint.address,
                    authority: freezeAuthority.address,
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

                await assertToken(client.rpc, mint.address, {
                    authorities: { freezeAuthority: freezeAuthority.address },
                });

                // When: Transferring freeze authority to new address
                const updateTx = await getUpdateAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: AuthorityType.FreezeAccount,
                    currentAuthority: freezeAuthority,
                    newAuthority: newAuthority.address,
                });

                const updateSig = await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT);
                assertTxSuccess(updateSig);

                // Then: New freeze authority is set
                await assertToken(client.rpc, mint.address, {
                    authorities: { freezeAuthority: newAuthority.address },
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should transfer permanent delegate',
            async () => {
                const permanentDelegate = await generateKeyPairSigner();

                // Given: A token with permanent delegate
                const tokenBuilder = new Token()
                    .withMetadata({
                        mintAddress: mint.address,
                        authority: mintAuthority.address,
                        metadata: {
                            name: 'Test Token',
                            symbol: 'TEST',
                            uri: 'https://example.com/test.json',
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

                await assertToken(client.rpc, mint.address, {
                    authorities: { permanentDelegate: permanentDelegate.address },
                    extensions: [
                        {
                            name: 'PermanentDelegate',
                            details: { delegate: permanentDelegate.address },
                        },
                    ],
                });

                // When: Transferring permanent delegate to new address
                const updateTx = await getUpdateAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: AuthorityType.PermanentDelegate,
                    currentAuthority: permanentDelegate,
                    newAuthority: newAuthority.address,
                });

                const updateSig = await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT);
                assertTxSuccess(updateSig);

                // Then: New permanent delegate is set
                await assertToken(client.rpc, mint.address, {
                    authorities: { permanentDelegate: newAuthority.address },
                    extensions: [
                        {
                            name: 'PermanentDelegate',
                            details: { delegate: newAuthority.address },
                        },
                    ],
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should transfer metadata authority',
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

                // When: Transferring metadata authority to new address
                const updateTx = await getUpdateAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: 'Metadata',
                    currentAuthority: mintAuthority,
                    newAuthority: newAuthority.address,
                });

                const updateSig = await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT);
                assertTxSuccess(updateSig);

                // Then: New metadata authority is set
                await assertToken(client.rpc, mint.address, {
                    authorities: { metadataAuthority: newAuthority.address },
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should remove mint authority',
            async () => {
                // Given: A token with mint authority
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

                await assertToken(client.rpc, mint.address, {
                    authorities: { mintAuthority: mintAuthority.address },
                });

                // When: Removing mint authority
                const removeTx = await getRemoveAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: AuthorityType.MintTokens,
                    currentAuthority: mintAuthority,
                });

                const removeSig = await sendAndConfirmTransaction(client, removeTx, DEFAULT_COMMITMENT);
                assertTxSuccess(removeSig);

                // Then: Mint authority is removed
                await assertToken(client.rpc, mint.address, {
                    authorities: { mintAuthority: null },
                });

                // And: Old authority cannot mint tokens
                const mintTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    payer.address,
                    1000000,
                    mintAuthority,
                    payer,
                );

                await assertTxFailure(client, mintTx);
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Authority Validation', () => {
        it(
            'should verify only current authority can update',
            async () => {
                const unauthorizedSigner = await generateKeyPairSigner();

                // Given: A token with mint authority
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

                await assertToken(client.rpc, mint.address, {
                    authorities: { mintAuthority: mintAuthority.address },
                });

                // When: Trying to update with unauthorized signer
                const updateTx = await getUpdateAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: AuthorityType.MintTokens,
                    currentAuthority: unauthorizedSigner,
                    newAuthority: newAuthority.address,
                });

                // Then: Transaction fails
                await assertTxFailure(client, updateTx);

                // And: Authority remains unchanged
                await assertToken(client.rpc, mint.address, {
                    authorities: { mintAuthority: mintAuthority.address },
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should verify new authority can perform operations',
            async () => {
                // Given: A token with mint authority
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

                // When: Transferring mint authority
                const updateTx = await getUpdateAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: AuthorityType.MintTokens,
                    currentAuthority: mintAuthority,
                    newAuthority: newAuthority.address,
                });

                await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT);

                await assertToken(client.rpc, mint.address, {
                    authorities: { mintAuthority: newAuthority.address },
                });

                // Then: New authority can mint tokens
                const mintTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    payer.address,
                    1000000,
                    newAuthority,
                    payer,
                );

                const mintSig = await sendAndConfirmTransaction(client, mintTx);
                assertTxSuccess(mintSig);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should verify old authority cannot perform operations after transfer',
            async () => {
                // Given: A token with mint authority
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

                // When: Transferring mint authority
                const updateTx = await getUpdateAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: AuthorityType.MintTokens,
                    currentAuthority: mintAuthority,
                    newAuthority: newAuthority.address,
                });

                await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT);

                // Then: Old authority cannot mint tokens
                const mintTx = await createMintToTransaction(
                    client.rpc,
                    mint.address,
                    payer.address,
                    1000000,
                    mintAuthority,
                    payer,
                );

                await assertTxFailure(client, mintTx);
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Update Metadata', () => {
        const ORIGINAL = { name: 'Test Token', symbol: 'TEST', uri: 'https://example.com/test.json' };

        const createTokenWithMetadata = async () => {
            const createTx = await new Token()
                .withMetadata({
                    mintAddress: mint.address,
                    authority: mintAuthority.address,
                    metadata: ORIGINAL,
                    additionalMetadata: new Map(),
                })
                .buildTransaction({ rpc: client.rpc, decimals: 6, mintAuthority, mint, feePayer: payer });
            await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
        };

        const getMintAccount = async () => {
            const { value } = await client.rpc
                .getAccountInfo(mint.address, { encoding: 'base64', commitment: DEFAULT_COMMITMENT })
                .send();
            expect(value).not.toBeNull();
            return { space: BigInt(value!.space), lamports: value!.lamports };
        };

        it(
            'grows the URI by 200 bytes, topping up the mint rent from the fee payer (HOO-955)',
            async () => {
                await createTokenWithMetadata();
                const before = await getMintAccount();
                const uri = ORIGINAL.uri + '?' + 'x'.repeat(199);

                const updateTx = await createUpdateMetadataTransaction(client.rpc, {
                    mint: mint.address,
                    updateAuthority: mintAuthority,
                    feePayer: payer,
                    updates: [{ field: 'uri', value: uri }],
                });
                // The freshly created mint holds exactly its rent, so the builder must add a top-up
                expect(updateTx.instructions).toHaveLength(2);
                assertTxSuccess(await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT));

                await assertToken(client.rpc, mint.address, {
                    metadata: { ...ORIGINAL, uri, updateAuthority: mintAuthority.address },
                });
                const after = await getMintAccount();
                expect(after.space).toBe(before.space + 200n);
                const rent = await client.rpc.getMinimumBalanceForRentExemption(after.space).send();
                expect(after.lamports).toBe(lamports(rent));
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'updates name, symbol and URI in one transaction, shrinking without a top-up',
            async () => {
                await createTokenWithMetadata();
                const updates = [
                    { field: 'name', value: 'Renamed' },
                    { field: 'symbol', value: 'RN' },
                    { field: 'uri', value: 'https://e.co/r.json' },
                ] as const;

                const updateTx = await createUpdateMetadataTransaction(client.rpc, {
                    mint: mint.address,
                    updateAuthority: mintAuthority,
                    feePayer: payer,
                    updates,
                });
                expect(updateTx.instructions).toHaveLength(3);
                assertTxSuccess(await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT));

                await assertToken(client.rpc, mint.address, {
                    metadata: { name: 'Renamed', symbol: 'RN', uri: 'https://e.co/r.json' },
                });
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'grows the name before shrinking the URI, funding only the final size',
            async () => {
                await createTokenWithMetadata();
                const before = await getMintAccount();
                // name +100 bytes, then uri -10 bytes: the mint is 100 bytes larger between the two
                // instructions than at the end, but only the final +90 bytes are funded
                const name = ORIGINAL.name + 'x'.repeat(100);
                const uri = 'https://e.co/r.json';

                const updateTx = await createUpdateMetadataTransaction(client.rpc, {
                    mint: mint.address,
                    updateAuthority: mintAuthority,
                    feePayer: payer,
                    updates: [
                        { field: 'name', value: name },
                        { field: 'uri', value: uri },
                    ],
                });
                expect(updateTx.instructions).toHaveLength(3);
                assertTxSuccess(await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT));

                await assertToken(client.rpc, mint.address, {
                    metadata: { ...ORIGINAL, name, uri, updateAuthority: mintAuthority.address },
                });
                const after = await getMintAccount();
                expect(after.space).toBe(before.space + 90n);
                const rent = await client.rpc.getMinimumBalanceForRentExemption(after.space).send();
                expect(after.lamports).toBe(lamports(rent));
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'grows the name before shrinking the URI, with no top-up when the net size shrinks',
            async () => {
                await createTokenWithMetadata();
                const before = await getMintAccount();
                // name +20 bytes, then uri -28 bytes: the mint briefly exceeds its funded size
                const name = ORIGINAL.name + 'x'.repeat(20);
                const uri = 'u';

                const updateTx = await createUpdateMetadataTransaction(client.rpc, {
                    mint: mint.address,
                    updateAuthority: mintAuthority,
                    feePayer: payer,
                    updates: [
                        { field: 'name', value: name },
                        { field: 'uri', value: uri },
                    ],
                });
                expect(updateTx.instructions).toHaveLength(2);
                assertTxSuccess(await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT));

                await assertToken(client.rpc, mint.address, {
                    metadata: { ...ORIGINAL, name, uri, updateAuthority: mintAuthority.address },
                });
                const after = await getMintAccount();
                expect(after.space).toBe(before.space - 8n);
                expect(after.lamports).toBe(before.lamports);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'refuses to build when the signer is not the metadata update authority',
            async () => {
                await createTokenWithMetadata();

                await expect(
                    createUpdateMetadataTransaction(client.rpc, {
                        mint: mint.address,
                        updateAuthority: newAuthority,
                        feePayer: payer,
                        updates: [{ field: 'symbol', value: 'NOPE' }],
                    }),
                ).rejects.toThrow('is not the metadata update authority');
            },
            DEFAULT_TIMEOUT,
        );
    });
});
