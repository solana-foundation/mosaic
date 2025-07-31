import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createSolanaClient } from '../utils/rpc.js';
import { loadKeypair } from '../utils/solana.js';
import {
  signTransactionMessageWithSigners,
  type Address,
  createTransaction,
} from 'gill';
import {
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { decimalAmountToRaw, resolveTokenAccount } from '@mosaic/sdk';

interface TransferOptions {
  mintAddress: string;
  recipient: string;
  amount: string;
  rpcUrl?: string;
  keypair?: string;
}

async function getMintInfo(
  rpc: ReturnType<typeof createSolanaClient>['rpc'],
  mint: Address
): Promise<{ decimals: number }> {
  const accountInfo = await rpc
    .getAccountInfo(mint, { encoding: 'jsonParsed' })
    .send();

  if (!accountInfo.value) {
    throw new Error(`Mint account ${mint} not found`);
  }

  const data = accountInfo.value.data;
  if (!('parsed' in data) || !data.parsed?.info) {
    throw new Error(`Unable to parse mint data for ${mint}`);
  }

  const mintInfo = data.parsed.info as {
    decimals: number;
  };

  return {
    decimals: mintInfo.decimals,
  };
}

export const transferCommand = new Command('transfer')
  .description('Transfer tokens to a recipient (creates ATA if needed)')
  .requiredOption(
    '-m, --mint-address <mint-address>',
    'The mint address of the token'
  )
  .requiredOption(
    '-r, --recipient <recipient>',
    'The recipient wallet address'
  )
  .requiredOption(
    '-a, --amount <amount>',
    'The decimal amount to transfer (e.g., 1.5)'
  )
  .action(async (options: TransferOptions, command) => {
    const spinner = ora('Transferring tokens...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;

      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Load sender keypair
      const senderKeypair = await loadKeypair(keypairPath);

      // Parse and validate amount
      const decimalAmount = parseFloat(options.amount);
      if (isNaN(decimalAmount) || decimalAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      spinner.text = 'Fetching mint information...';

      // Get mint info for decimals
      const mintInfo = await getMintInfo(rpc, options.mintAddress as Address);

      // Convert decimal amount to raw amount
      const rawAmount = decimalAmountToRaw(decimalAmount, mintInfo.decimals);

      spinner.text = 'Resolving token accounts...';

      // Resolve sender's token account
      const senderTokenAccountInfo = await resolveTokenAccount(
        rpc,
        senderKeypair.address,
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
          payer: senderKeypair,
          tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        })
      );

      // Add transfer instruction
      instructions.push(
        getTransferCheckedInstruction({
          source: senderTokenAccountInfo.tokenAccount,
          destination: recipientTokenAccountInfo.tokenAccount,
          mint: options.mintAddress as Address,
          authority: senderKeypair,
          amount: rawAmount,
          decimals: mintInfo.decimals,
        })
      );

      spinner.text = 'Building transaction...';

      // Get latest blockhash for transaction
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      // Create transaction
      const transaction = createTransaction({
        version: 'legacy',
        feePayer: senderKeypair,
        latestBlockhash,
        instructions,
      });

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

      console.log(chalk.cyan('\\n⚡ Result:'));
      console.log(
        `   ${chalk.green('✓')} Tokens transferred successfully`
      );
      if (recipientTokenAccountInfo.wasOwnerAddress) {
        console.log(
          `   ${chalk.green('✓')} Created Associated Token Account for recipient`
        );
      }
    } catch (error) {
      spinner.fail('Failed to transfer tokens');
      console.error(
        chalk.red('\\n❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );

      // Provide helpful error context for common issues
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          console.error(
            chalk.yellow('\\n💡 Tip:'),
            'You may not have enough tokens to transfer, or insufficient SOL for transaction fees.'
          );
        } else if (error.message.includes('Account does not exist')) {
          console.error(
            chalk.yellow('\\n💡 Tip:'),
            'Your token account may not exist. You need to have tokens first before you can transfer them.'
          );
        }
      }

      process.exit(1);
    }
  });