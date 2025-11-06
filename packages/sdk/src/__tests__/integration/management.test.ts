import setupTestSuite from './setup';
import type { Client } from './setup';
import type { KeyPairSigner, TransactionSigner } from 'gill';
import { generateKeyPairSigner } from 'gill';
import {
  sendAndConfirmTransaction,
  assertTxSuccess,
  assertBalance,
  DEFAULT_TIMEOUT,
  DEFAULT_COMMITMENT,
  describeSkipIf,
} from './helpers';
import { Token } from '../../issuance';
import { createMintToTransaction } from '../../management';
import { decimalAmountToRaw } from '../../transactionUtil';

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
        await assertBalance(
          client.rpc,
          recipient.address,
          mint.address,
          0n,
          DEFAULT_COMMITMENT
        );

        // When: Minting tokens to a new recipient
        const mintTx = await createMintToTransaction(
          client.rpc,
          mint.address,
          recipient.address,
          1_000_000,
          mintAuthority,
          payer
        );

        const mintSig = await sendAndConfirmTransaction(
          client,
          mintTx,
          DEFAULT_COMMITMENT
        );
        assertTxSuccess(mintSig);

        // Then: Recipient has the minted tokens
        await assertBalance(
          client.rpc,
          recipient.address,
          mint.address,
          decimalAmountToRaw(1_000_000, 6),
          DEFAULT_COMMITMENT
        );
      },
      DEFAULT_TIMEOUT
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
          payer
        );

        await sendAndConfirmTransaction(client, mintTx1, DEFAULT_COMMITMENT);

        await assertBalance(
          client.rpc,
          testRecipient.address,
          mint.address,
          decimalAmountToRaw(initialMintAmount, 6),
          DEFAULT_COMMITMENT
        );

        // When: Minting more tokens to same recipient
        const mintTx2 = await createMintToTransaction(
          client.rpc,
          mint.address,
          testRecipient.address,
          secondMintAmount,
          mintAuthority,
          payer
        );

        const mintSig2 = await sendAndConfirmTransaction(
          client,
          mintTx2,
          DEFAULT_COMMITMENT
        );
        assertTxSuccess(mintSig2);

        // Then: Recipient has combined balance
        await assertBalance(
          client.rpc,
          testRecipient.address,
          mint.address,
          decimalAmountToRaw(initialMintAmount + secondMintAmount, 6),
          DEFAULT_COMMITMENT
        );
      },
      DEFAULT_TIMEOUT
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
            payer
          );

          await sendAndConfirmTransaction(client, mintTx, DEFAULT_COMMITMENT);

          // Then: Balance increases with each mint
          await assertBalance(
            client.rpc,
            recipient.address,
            mint.address,
            decimalAmountToRaw(amountPerOperation * i, 6),
            DEFAULT_COMMITMENT
          );
        }
      },
      DEFAULT_TIMEOUT
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

            await sendAndConfirmTransaction(
              client,
              createTx,
              DEFAULT_COMMITMENT
            );

            // Mint tokens
            const mintTx = await createMintToTransaction(
              client.rpc,
              newMint.address,
              recipient.address,
              amount,
              mintAuthority,
              payer
            );

            await sendAndConfirmTransaction(client, mintTx, DEFAULT_COMMITMENT);

            // Verify balance reflects correct decimals
            await assertBalance(
              client.rpc,
              recipient.address,
              newMint.address,
              decimalAmountToRaw(amount, decimals),
              DEFAULT_COMMITMENT
            );
          })
        );
      },
      DEFAULT_TIMEOUT
    );
  });

  // describe('Force Transfer', () => {
  //   it(
  //     'should force transfer between existing accounts',
  //     async () => {
  //       const sender = await generateKeyPairSigner();
  //       const receiver = await generateKeyPairSigner();
  //       const permanentDelegate = await generateKeyPairSigner();

  //       // Create token with permanent delegate and mint to both accounts
  //       await createTestTokenWithAssertions({
  //         client,
  //         options: {
  //           name: 'Force Transfer Token',
  //           symbol: 'FTT',
  //           decimals: 6,
  //           metadataAuthority: mintAuthority.address,
  //           mintAuthority,
  //           freezeAuthority: freezeAuthority.address,
  //           permanentDelegate: permanentDelegate.address,
  //           payer,
  //           mint,
  //         },
  //       });

  //       // Mint tokens to sender
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: sender.address,
  //           amount: 1_000_000,
  //         },
  //       });

  //       // Mint tokens to receiver to create ATA
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: receiver.address,
  //           amount: 500_000,
  //         },
  //       });

  //       // Force transfer from sender to receiver
  //       const forceTransferTx = await createForceTransferTransaction(
  //         client.rpc,
  //         mint.address,
  //         sender.address,
  //         receiver.address,
  //         1, // 1 token (decimal amount)
  //         permanentDelegate,
  //         payer
  //       );

  //       const signature = await sendAndConfirmTransaction(client, forceTransferTx);
  //       assertTxSuccess(signature);

  //       // Verify balances
  //       await assertBalances(client, [
  //         {
  //           recipient: sender.address,
  //           mint: mint.address,
  //           expectedAmount: 0n,
  //         },
  //         {
  //           recipient: receiver.address,
  //           mint: mint.address,
  //           expectedAmount: decimalAmountToRaw(1_500_000, 6),
  //         },
  //       ]);
  //     },
  //     DEFAULT_TIMEOUT
  //   );

  //   it(
  //     'should force transfer with destination ATA creation',
  //     async () => {
  //       const sender = await generateKeyPairSigner();
  //       const receiver = await generateKeyPairSigner();
  //       const permanentDelegate = await generateKeyPairSigner();

  //       await createTestTokenWithAssertions({
  //         client,
  //         options: {
  //           name: 'Force Transfer Token',
  //           symbol: 'FTT',
  //           decimals: 6,
  //           metadataAuthority: mintAuthority.address,
  //           mintAuthority,
  //           freezeAuthority: freezeAuthority.address,
  //           permanentDelegate: permanentDelegate.address,
  //           payer,
  //           mint,
  //         },
  //       });

  //       // Mint tokens to sender
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: sender.address,
  //           amount: 1_000_000,
  //         },
  //       });

  //       // Force transfer to receiver (ATA doesn't exist yet)
  //       const forceTransferTx = await createForceTransferTransaction(
  //         client.rpc,
  //         mint.address,
  //         sender.address,
  //         receiver.address,
  //         1,
  //         permanentDelegate,
  //         payer
  //       );

  //       const signature = await sendAndConfirmTransaction(client, forceTransferTx);
  //       assertTxSuccess(signature);

  //       // Verify balances
  //       await assertBalances(client, [
  //         {
  //           recipient: sender.address,
  //           mint: mint.address,
  //           expectedAmount: 0n,
  //         },
  //         {
  //           recipient: receiver.address,
  //           mint: mint.address,
  //           expectedAmount: decimalAmountToRaw(1_000_000, 6),
  //         },
  //       ]);
  //     },
  //     DEFAULT_TIMEOUT
  //   );

  //   it(
  //     'should force transfer with permissionless thaw on destination',
  //     async () => {
  //       const sender = await generateKeyPairSigner();
  //       const receiver = await generateKeyPairSigner();
  //       const permanentDelegate = await generateKeyPairSigner();

  //       // Create token with SRFC-37 enabled
  //       await createTestTokenWithAssertions({
  //         client,
  //         options: {
  //           name: 'SRFC37 Force Token',
  //           symbol: 'SRFC',
  //           decimals: 6,
  //           metadataAuthority: mintAuthority.address,
  //           mintAuthority,
  //           freezeAuthority: TOKEN_ACL_PROGRAM_ID,
  //           defaultAccountState: { initialStateInitialized: false },
  //           permanentDelegate: permanentDelegate.address,
  //           payer,
  //           mint,
  //         },
  //       });

  //       // Mint tokens to sender
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: sender.address,
  //           amount: 1_000_000,
  //         },
  //       });

  //       // Force transfer to receiver (will create frozen ATA and thaw it)
  //       const forceTransferTx = await createForceTransferTransaction(
  //         client.rpc,
  //         mint.address,
  //         sender.address,
  //         receiver.address,
  //         1,
  //         permanentDelegate,
  //         payer
  //       );

  //       const signature = await sendAndConfirmTransaction(client, forceTransferTx);
  //       assertTxSuccess(signature);

  //       // Verify balances
  //       await assertBalances(client, [
  //         {
  //           recipient: sender.address,
  //           mint: mint.address,
  //           expectedAmount: 0n,
  //         },
  //         {
  //           recipient: receiver.address,
  //           mint: mint.address,
  //           expectedAmount: decimalAmountToRaw(1_000_000, 6),
  //         },
  //       ]);
  //     },
  //     DEFAULT_TIMEOUT
  //   );

  //   it(
  //     'should validate permanent delegate authority',
  //     async () => {
  //       const sender = await generateKeyPairSigner();
  //       const receiver = await generateKeyPairSigner();
  //       const permanentDelegate = await generateKeyPairSigner();
  //       const wrongDelegate = await generateKeyPairSigner();

  //       await createTestTokenWithAssertions({
  //         client,
  //         options: {
  //           name: 'Auth Check Token',
  //           symbol: 'AUTH',
  //           decimals: 6,
  //           metadataAuthority: mintAuthority.address,
  //           mintAuthority,
  //           freezeAuthority: freezeAuthority.address,
  //           permanentDelegate: permanentDelegate.address,
  //           payer,
  //           mint,
  //         },
  //       });

  //       // Mint tokens to sender
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: sender.address,
  //           amount: 1_000_000,
  //         },
  //       });

  //       // Try force transfer with wrong delegate - should fail
  //       const forceTransferTx = await createForceTransferTransaction(
  //         client.rpc,
  //         mint.address,
  //         sender.address,
  //         receiver.address,
  //         1,
  //         wrongDelegate,
  //         payer
  //       );

  //       await assertTxFailure(client, forceTransferTx);

  //       // Verify sender balance unchanged
  //       await assertBalances(client, [
  //         {
  //           recipient: sender.address,
  //           mint: mint.address,
  //           expectedAmount: decimalAmountToRaw(1_000_000, 6),
  //         },
  //       ]);
  //     },
  //     DEFAULT_TIMEOUT
  //   );
  // });

  // describe('Force Burn', () => {
  //   it(
  //     'should force burn from wallet with tokens',
  //     async () => {
  //       const wallet = await generateKeyPairSigner();
  //       const permanentDelegate = await generateKeyPairSigner();

  //       await createTestTokenWithAssertions({
  //         client,
  //         options: {
  //           name: 'Force Burn Token',
  //           symbol: 'FBT',
  //           decimals: 6,
  //           metadataAuthority: mintAuthority.address,
  //           mintAuthority,
  //           freezeAuthority: freezeAuthority.address,
  //           permanentDelegate: permanentDelegate.address,
  //           payer,
  //           mint,
  //         },
  //       });

  //       // Mint tokens
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: wallet.address,
  //           amount: 1_000_000,
  //         },
  //       });

  //       // Force burn half
  //       const forceBurnTx = await createForceBurnTransaction(
  //         client.rpc,
  //         mint.address,
  //         wallet.address,
  //         0.5, // 0.5 tokens
  //         permanentDelegate,
  //         payer
  //       );

  //       const signature = await sendAndConfirmTransaction(client, forceBurnTx);
  //       assertTxSuccess(signature);

  //       // Verify balance
  //       await assertBalances(client, [
  //         {
  //           recipient: wallet.address,
  //           mint: mint.address,
  //           expectedAmount: decimalAmountToRaw(500_000, 6),
  //         },
  //       ]);
  //     },
  //     DEFAULT_TIMEOUT
  //   );

  //   it(
  //     'should validate permanent delegate authority',
  //     async () => {
  //       const wallet = await generateKeyPairSigner();
  //       const permanentDelegate = await generateKeyPairSigner();
  //       const wrongDelegate = await generateKeyPairSigner();

  //       await createTestTokenWithAssertions({
  //         client,
  //         options: {
  //           name: 'Burn Auth Token',
  //           symbol: 'BAT',
  //           decimals: 6,
  //           metadataAuthority: mintAuthority.address,
  //           mintAuthority,
  //           freezeAuthority: freezeAuthority.address,
  //           permanentDelegate: permanentDelegate.address,
  //           payer,
  //           mint,
  //         },
  //       });

  //       // Mint tokens
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: wallet.address,
  //           amount: 1_000_000,
  //         },
  //       });

  //       // Try force burn with wrong delegate - should fail
  //       const forceBurnTx = await createForceBurnTransaction(
  //         client.rpc,
  //         mint.address,
  //         wallet.address,
  //         0.5,
  //         wrongDelegate,
  //         payer
  //       );

  //       await assertTxFailure(client, forceBurnTx);

  //       // Verify balance unchanged
  //       await assertBalances(client, [
  //         {
  //           recipient: wallet.address,
  //           mint: mint.address,
  //           expectedAmount: decimalAmountToRaw(1_000_000, 6),
  //         },
  //       ]);
  //     },
  //     DEFAULT_TIMEOUT
  //   );
  // });

  // describe('Pause Operations', () => {
  //   it(
  //     'should freeze wallet',
  //     async () => {
  //       const wallet = await generateKeyPairSigner();

  //       // Create token with Token ACL as freeze authority
  //       await createTestTokenWithAssertions({
  //         client,
  //         options: {
  //           name: 'Freeze Token',
  //           symbol: 'FRZ',
  //           decimals: 6,
  //           metadataAuthority: mintAuthority.address,
  //           mintAuthority,
  //           freezeAuthority: TOKEN_ACL_PROGRAM_ID,
  //           payer,
  //           mint,
  //         },
  //       });

  //       // Mint tokens
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: wallet.address,
  //           amount: 1_000_000,
  //         },
  //       });

  //       // Verify not frozen initially
  //       let frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address);
  //       expect(frozen).toBe(false);

  //       // Get token account address
  //       const tokenAccount = await getAssociatedTokenAccountAddress(
  //         mint.address,
  //         wallet.address,
  //         TOKEN_2022_PROGRAM_ADDRESS
  //       );

  //       // Freeze the account
  //       const freezeTx = await getFreezeTransaction({
  //         rpc: client.rpc,
  //         payer,
  //         authority: freezeAuthority,
  //         tokenAccount,
  //       });

  //       const signature = await sendAndConfirmTransaction(client, freezeTx);
  //       assertTxSuccess(signature);

  //       // Verify frozen
  //       frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address);
  //       expect(frozen).toBe(true);
  //     },
  //     DEFAULT_TIMEOUT
  //   );

  //   it(
  //     'should thaw wallet',
  //     async () => {
  //       const wallet = await generateKeyPairSigner();

  //       await createTestTokenWithAssertions({
  //         client,
  //         options: {
  //           name: 'Thaw Token',
  //           symbol: 'THW',
  //           decimals: 6,
  //           metadataAuthority: mintAuthority.address,
  //           mintAuthority,
  //           freezeAuthority: TOKEN_ACL_PROGRAM_ID,
  //           payer,
  //           mint,
  //         },
  //       });

  //       // Mint tokens
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: wallet.address,
  //           amount: 1_000_000,
  //         },
  //       });

  //       // Get token account address
  //       const tokenAccount = await getAssociatedTokenAccountAddress(
  //         mint.address,
  //         wallet.address,
  //         TOKEN_2022_PROGRAM_ADDRESS
  //       );

  //       // Freeze first
  //       const freezeTx = await getFreezeTransaction({
  //         rpc: client.rpc,
  //         payer,
  //         authority: freezeAuthority,
  //         tokenAccount,
  //       });
  //       await sendAndConfirmTransaction(client, freezeTx);

  //       // Verify frozen
  //       let frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address);
  //       expect(frozen).toBe(true);

  //       // Thaw the account
  //       const thawTx = await getThawTransaction({
  //         rpc: client.rpc,
  //         payer,
  //         authority: freezeAuthority,
  //         tokenAccount,
  //       });

  //       const signature = await sendAndConfirmTransaction(client, thawTx);
  //       assertTxSuccess(signature);

  //       // Verify not frozen
  //       frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address);
  //       expect(frozen).toBe(false);
  //     },
  //     DEFAULT_TIMEOUT
  //   );

  //   it(
  //     'should handle freeze then thaw workflow',
  //     async () => {
  //       const wallet = await generateKeyPairSigner();

  //       await createTestTokenWithAssertions({
  //         client,
  //         options: {
  //           name: 'Workflow Token',
  //           symbol: 'WRK',
  //           decimals: 6,
  //           metadataAuthority: mintAuthority.address,
  //           mintAuthority,
  //           freezeAuthority: TOKEN_ACL_PROGRAM_ID,
  //           payer,
  //           mint,
  //         },
  //       });

  //       // Mint tokens
  //       await mintToWithAssertions({
  //         client,
  //         mint: mint.address,
  //         mintAuthority,
  //         payer,
  //         mintToOptions: {
  //           recipient: wallet.address,
  //           amount: 1_000_000,
  //         },
  //       });

  //       // Get token account address
  //       const tokenAccount = await getAssociatedTokenAccountAddress(
  //         mint.address,
  //         wallet.address,
  //         TOKEN_2022_PROGRAM_ADDRESS
  //       );

  //       // Initial state: not frozen
  //       let frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address);
  //       expect(frozen).toBe(false);

  //       // Freeze
  //       const freezeTx = await getFreezeTransaction({
  //         rpc: client.rpc,
  //         payer,
  //         authority: freezeAuthority,
  //         tokenAccount,
  //       });
  //       await sendAndConfirmTransaction(client, freezeTx);

  //       frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address);
  //       expect(frozen).toBe(true);

  //       // Thaw
  //       const thawTx = await getThawTransaction({
  //         rpc: client.rpc,
  //         payer,
  //         authority: freezeAuthority,
  //         tokenAccount,
  //       });
  //       await sendAndConfirmTransaction(client, thawTx);

  //       frozen = await isAccountFrozen(client.rpc, wallet.address, mint.address);
  //       expect(frozen).toBe(false);

  //       // Verify balance unchanged throughout
  //       await assertBalances(client, [
  //         {
  //           recipient: wallet.address,
  //           mint: mint.address,
  //           expectedAmount: decimalAmountToRaw(1_000_000, 6),
  //         },
  //       ]);
  //     },
  //     DEFAULT_TIMEOUT
  //   );
  // });
});
