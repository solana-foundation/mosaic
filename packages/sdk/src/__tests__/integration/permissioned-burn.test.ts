import setupTestSuite from './setup';
import type { Client } from './setup';
import type { KeyPairSigner, TransactionSigner } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
import {
    sendAndConfirmTransaction,
    assertTxSuccess,
    assertTxFailure,
    assertBalance,
    DEFAULT_TIMEOUT,
    DEFAULT_COMMITMENT,
    describeSkipIf,
} from './helpers';
import { Token } from '../../issuance';
import {
    createMintToTransaction,
    createBurnTransaction,
    createForceBurnTransaction,
    createPermissionedBurnTransaction,
    getPermissionedBurnAuthority,
    validatePermissionedBurnForMint,
} from '../../management';
import { getUpdateAuthorityTransaction, getRemoveAuthorityTransaction } from '../../administration';
import { createTokenizedSecurityInitTransaction } from '../../templates';
import { inspectToken } from '../../inspection';
import { decimalAmountToRaw } from '../../transaction-util';
import { AuthorityType } from '@solana-program/token-2022';

// Requires a local validator whose Token-2022 program supports permissioned burn (program >= v11).
// Skipped until the CI validator ships v11; flip to describeSkipIf() once it does.
describeSkipIf(true)('Permissioned Burn Integration Tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let freezeAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;
    let holder: KeyPairSigner<string>;

    beforeAll(async () => {
        const testSuite = await setupTestSuite();
        client = testSuite.client;
        mintAuthority = testSuite.mintAuthority;
        freezeAuthority = testSuite.freezeAuthority;
        payer = testSuite.payer;
    });

    beforeEach(async () => {
        mint = await generateKeyPairSigner();
        holder = await generateKeyPairSigner();
    });

    async function createPermissionedBurnMint(burnAuthority: TransactionSigner<string>): Promise<void> {
        const tokenBuilder = new Token()
            .withMetadata({
                mintAddress: mint.address,
                authority: mintAuthority.address,
                metadata: {
                    name: 'Permissioned Burn Token',
                    symbol: 'PBT',
                    uri: 'https://example.com/pbt.json',
                },
                additionalMetadata: new Map(),
            })
            .withPermissionedBurn(burnAuthority.address);

        const createTx = await tokenBuilder.buildTransaction({
            rpc: client.rpc,
            decimals: 6,
            mintAuthority,
            freezeAuthority: freezeAuthority.address,
            mint,
            feePayer: payer,
        });
        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
    }

    async function mintTo(recipient: KeyPairSigner<string>, amount: number): Promise<void> {
        const mintTx = await createMintToTransaction(
            client.rpc,
            mint.address,
            recipient.address,
            amount,
            mintAuthority,
            payer,
        );
        assertTxSuccess(await sendAndConfirmTransaction(client, mintTx));
    }

    describe('Mint creation and inspection', () => {
        it(
            'should create a mint with the permissioned burn extension and expose its authority',
            async () => {
                await createPermissionedBurnMint(mintAuthority);

                await expect(getPermissionedBurnAuthority(client.rpc, mint.address)).resolves.toBe(
                    mintAuthority.address,
                );
                await expect(
                    validatePermissionedBurnForMint(client.rpc, mint.address, mintAuthority.address),
                ).resolves.toBeUndefined();

                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
                expect(inspection.extensions.map(ext => ext.name)).toContain('PermissionedBurn');
                expect(inspection.authorities.permissionedBurnAuthority).toBe(mintAuthority.address);
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should include permissioned burn in the tokenized security template by default',
            async () => {
                const createTx = await createTokenizedSecurityInitTransaction(
                    client.rpc,
                    'Security Token',
                    'SEC',
                    6,
                    'https://example.com/sec.json',
                    payer.address,
                    mint,
                    payer,
                    freezeAuthority.address,
                    { enableSrfc37: false },
                );
                assertTxSuccess(await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT));

                const inspection = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
                expect(inspection.extensions.map(ext => ext.name)).toContain('PermissionedBurn');
                // Defaults to the mint authority
                expect(inspection.authorities.permissionedBurnAuthority).toBe(payer.address);
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Burning', () => {
        it(
            'should burn with the configured authority co-signing and reject a wrong authority',
            async () => {
                await createPermissionedBurnMint(mintAuthority);
                await mintTo(holder, 10);

                // Wrong co-signer: program rejects the burn
                const wrongAuthority = await generateKeyPairSigner();
                const badTx = await createBurnTransaction(client.rpc, mint.address, holder, 1, payer, wrongAuthority);
                await assertTxFailure(client, badTx);

                // Correct co-signer: burn succeeds
                const burnTx = await createBurnTransaction(client.rpc, mint.address, holder, 4, payer, mintAuthority);
                assertTxSuccess(await sendAndConfirmTransaction(client, burnTx));
                await assertBalance(client.rpc, holder.address, mint.address, decimalAmountToRaw(6, 6));
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should burn via createPermissionedBurnTransaction with owner and authority signing',
            async () => {
                await createPermissionedBurnMint(mintAuthority);
                await mintTo(holder, 5);

                const burnTx = await createPermissionedBurnTransaction(
                    client.rpc,
                    mint.address,
                    holder.address,
                    2,
                    mintAuthority,
                    payer,
                    holder,
                );
                assertTxSuccess(await sendAndConfirmTransaction(client, burnTx));
                await assertBalance(client.rpc, holder.address, mint.address, decimalAmountToRaw(3, 6));
            },
            DEFAULT_TIMEOUT,
        );

        it(
            'should force burn via permanent delegate when it is also the burn authority',
            async () => {
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
                    .withPermanentDelegate(mintAuthority.address)
                    .withPermissionedBurn(mintAuthority.address);
                const createTx = await tokenBuilder.buildTransaction({
                    rpc: client.rpc,
                    decimals: 6,
                    mintAuthority,
                    freezeAuthority: freezeAuthority.address,
                    mint,
                    feePayer: payer,
                });
                await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);
                await mintTo(holder, 8);

                // Delegate covers both the owner/delegate role and the burn authority co-signature
                const forceBurnTx = await createForceBurnTransaction(
                    client.rpc,
                    mint.address,
                    holder.address,
                    3,
                    mintAuthority,
                    payer,
                );
                assertTxSuccess(await sendAndConfirmTransaction(client, forceBurnTx));
                await assertBalance(client.rpc, holder.address, mint.address, decimalAmountToRaw(5, 6));
            },
            DEFAULT_TIMEOUT,
        );
    });

    describe('Authority management', () => {
        it(
            'should rotate and remove the permissioned burn authority',
            async () => {
                await createPermissionedBurnMint(mintAuthority);
                await mintTo(holder, 10);

                // Rotate to a new authority
                const newAuthority = await generateKeyPairSigner();
                const rotateTx = await getUpdateAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: AuthorityType.PermissionedBurn,
                    currentAuthority: mintAuthority,
                    newAuthority: newAuthority.address,
                });
                assertTxSuccess(await sendAndConfirmTransaction(client, rotateTx));
                await expect(getPermissionedBurnAuthority(client.rpc, mint.address)).resolves.toBe(
                    newAuthority.address,
                );

                // The new authority can co-sign burns
                const burnTx = await createBurnTransaction(client.rpc, mint.address, holder, 2, payer, newAuthority);
                assertTxSuccess(await sendAndConfirmTransaction(client, burnTx));

                // Remove the authority: regular burns work again
                const removeTx = await getRemoveAuthorityTransaction({
                    rpc: client.rpc,
                    payer,
                    mint: mint.address,
                    role: AuthorityType.PermissionedBurn,
                    currentAuthority: newAuthority,
                });
                assertTxSuccess(await sendAndConfirmTransaction(client, removeTx));
                await expect(getPermissionedBurnAuthority(client.rpc, mint.address)).resolves.toBeNull();

                const regularBurnTx = await createBurnTransaction(client.rpc, mint.address, holder, 3, payer);
                assertTxSuccess(await sendAndConfirmTransaction(client, regularBurnTx));
                await assertBalance(client.rpc, holder.address, mint.address, decimalAmountToRaw(5, 6));
            },
            DEFAULT_TIMEOUT,
        );
    });
});
