import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createSolanaClient } from '../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../utils/solana.js';
import { signTransactionMessageWithSigners, type Address, createTransaction, createNoopSigner } from 'gill';
import { maybeOutputRawTx } from '../utils/rawTx.js';
import {
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { getAddMemoInstruction } from 'gill/programs';
import {
  decimalAmountToRaw,
  getMintDecimals,
  getThawPermissionlessInstructions,
  resolveTokenAccount,
} from '@mosaic/sdk';

interface TransferOptions {
  mintAddress: string;
  recipient: string;
  amount: string;
  rpcUrl?: string;
  keypair?: string;
  memo?: string;
  sender?: string;
  feePayer?: string;
}

export const transferCommand = new Command('transfer')
  .description('Transfer tokens to a recipient (creates ATA if needed)')
  .requiredOption(
    '-m, --mint-address <mint-address>',
    'The mint address of the token'
  )
  .requiredOption('-r, --recipient <recipient>', 'The recipient wallet address')
  .requiredOption(
    '-a, --amount <amount>',
    'The decimal amount to transfer (e.g., 1.5)'
  )
  .option('-n, --memo <memo>', 'The memo to include in the transaction')
  .action(async (options: TransferOptions, command) => {
    const spinner = ora('Transferring tokens...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;
      const rawTx: string | undefined = parentOpts.rawTx;

      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Load or resolve sender address
      let senderAddress: Address;
      if (rawTx) {
        senderAddress = (options.sender || (await getAddressFromKeypair(keypairPath))) as Address;
      } else {
        const kp = await loadKeypair(keypairPath);
        senderAddress = kp.address as Address;
      }

      // Parse and validate amount
      const decimalAmount = parseFloat(options.amount);
      if (isNaN(decimalAmount) || decimalAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      spinner.text = 'Fetching mint information...';

      // Get mint info for decimals
      const decimals = await getMintDecimals(
        rpc,
        options.mintAddress as Address
      );

      // Convert decimal amount to raw amount
      const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

      spinner.text = 'Resolving token accounts...';

      // Resolve sender's token account
      const senderTokenAccountInfo = await resolveTokenAccount(
        rpc,
        senderAddress,
        options.mintAddress as Address
      );

      // Resolve recipient's token account
      const recipientTokenAccountInfo = await resolveTokenAccount(
        rpc,
        options.recipient as Address,
        options.mintAddress as Address
      );

      // Build transaction
      const instructions = [];

      // Create ATA for recipient if needed (idempotent)
      instructions.push(
        getCreateAssociatedTokenIdempotentInstruction({
          ata: recipientTokenAccountInfo.tokenAccount,
          owner: options.recipient as Address,
          mint: options.mintAddress as Address,
          payer: rawTx ? createNoopSigner(senderAddress) : createNoopSigner(senderAddress),
          tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        ...(recipientTokenAccountInfo.isFrozen
          ? await getThawPermissionlessInstructions({
              authority: rawTx ? createNoopSigner(senderAddress) : createNoopSigner(senderAddress),
              mint: options.mintAddress as Address,
              tokenAccount: recipientTokenAccountInfo.tokenAccount,
              tokenAccountOwner: options.recipient as Address,
              rpc,
            })
          : []),
        ...(options.memo
          ? [
              getAddMemoInstruction({
                memo: options.memo,
              }),
            ]
          : [])
      );

      // Add transfer instruction
      instructions.push(
        getTransferCheckedInstruction({
          source: senderTokenAccountInfo.tokenAccount,
          destination: recipientTokenAccountInfo.tokenAccount,
          mint: options.mintAddress as Address,
          authority: rawTx ? createNoopSigner(senderAddress) : createNoopSigner(senderAddress),
          amount: rawAmount,
          decimals,
        })
      );

      spinner.text = 'Building transaction...';

      // Get latest blockhash for transaction
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      // Create transaction
      const transaction = createTransaction({
        version: 'legacy',
        feePayer: rawTx ? createNoopSigner(senderAddress) : createNoopSigner(senderAddress),
        latestBlockhash,
        instructions,
      });

      if (maybeOutputRawTx(rawTx, transaction)) {
        spinner.succeed('Built unsigned transaction');
        return;
      }

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Transfer completed successfully!');

      // Display results
      console.log(chalk.green('✅ Transfer Transaction Successful'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(
        `   ${chalk.bold('From Account:')} ${senderTokenAccountInfo.tokenAccount}`
      );
      console.log(
        `   ${chalk.bold('To Account:')} ${recipientTokenAccountInfo.tokenAccount}`
      );
      console.log(`   ${chalk.bold('Recipient:')} ${options.recipient}`);
      console.log(`   ${chalk.bold('Amount:')} ${decimalAmount}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);

      console.log(chalk.cyan('⚡ Result:'));
      console.log(`   ${chalk.green('✓')} Tokens transferred successfully`);
      if (!recipientTokenAccountInfo.isInitialized) {
        console.log(
          `   ${chalk.green('✓')} Created Associated Token Account for recipient`
        );
      }
    } catch (error) {
      spinner.fail('Failed to transfer tokens');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error : 'Unknown error'
      );

      // Provide helpful error context for common issues
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          console.error(
            chalk.yellow('💡 Tip:'),
            'You may not have enough tokens to transfer, or insufficient SOL for transaction fees.'
          );
        } else if (error.message.includes('Account does not exist')) {
          console.error(
            chalk.yellow('💡 Tip:'),
            'Your token account may not exist. You need to have tokens first before you can transfer them.'
          );
        }
      }

      process.exit(1);
    }
  });
