import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  createForceTransferTransaction,
  validatePermanentDelegate,
} from '@mosaic/sdk';
import { createSolanaClient } from '../utils/rpc.js';
import { loadKeypair } from '../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';

interface ForceTransferOptions {
  mintAddress: string;
  fromAccount: string;
  recipient: string;
  amount: string;
  rpcUrl?: string;
  keypair?: string;
}

export const forceTransferCommand = new Command('force-transfer')
  .description('Force transfer tokens using permanent delegate authority')
  .requiredOption(
    '-m, --mint-address <mint-address>',
    'The mint address of the token'
  )
  .requiredOption(
    '-f, --from-account <from-account>',
    'The source account (wallet address or ATA address)'
  )
  .requiredOption(
    '-r, --recipient <recipient>',
    'The recipient account (wallet address or ATA address)'
  )
  .requiredOption(
    '-a, --amount <amount>',
    'The decimal amount to transfer (e.g., 1.5)'
  )
  .action(async (options: ForceTransferOptions, command) => {
    const spinner = ora('Force transferring tokens...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;

      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Load permanent delegate keypair (assuming it's the configured keypair)
      const permanentDelegateKeypair = await loadKeypair(keypairPath);

      // Parse and validate amount
      const decimalAmount = parseFloat(options.amount);
      if (isNaN(decimalAmount) || decimalAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      spinner.text = 'Validating permanent delegate authority...';

      // Validate that the mint has permanent delegate extension and our keypair is the delegate
      await validatePermanentDelegate(
        rpc,
        options.mintAddress as Address,
        permanentDelegateKeypair.address
      );

      spinner.text = 'Building force transfer transaction...';

      // Create force transfer transaction
      const transaction = await createForceTransferTransaction(
        rpc,
        options.mintAddress as Address,
        options.fromAccount as Address,
        options.recipient as Address,
        decimalAmount,
        permanentDelegateKeypair,
        permanentDelegateKeypair // Use same keypair as fee payer
      );

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Force transfer completed successfully!');

      // Display results
      console.log(chalk.green('✅ Force Transfer Transaction Successful'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(`   ${chalk.bold('From Account:')} ${options.fromAccount}`);
      console.log(`   ${chalk.bold('To Account:')} ${options.recipient}`);
      console.log(`   ${chalk.bold('Amount:')} ${decimalAmount}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      console.log(
        `   ${chalk.bold('Permanent Delegate:')} ${permanentDelegateKeypair.address}`
      );

      console.log(chalk.cyan('⚡ Result:'));
      console.log(
        `   ${chalk.green('✓')} Tokens force transferred using permanent delegate authority`
      );
      console.log(
        `   ${chalk.green('✓')} Transfer completed without requiring approval from source account`
      );
      console.log(
        `   ${chalk.yellow('⚠️')}  This action bypassed normal token account permissions`
      );
    } catch (error) {
      spinner.fail('Failed to force transfer tokens');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error : 'Unknown error'
      );

      // Provide helpful error context for common issues
      if (error instanceof Error) {
        if (error.message.includes('permanent delegate extension')) {
          console.error(
            chalk.yellow('\\n💡 Tip:'),
            'This mint may not have the permanent delegate extension enabled, or you may not be the designated permanent delegate.'
          );
        } else if (error.message.includes('insufficient funds')) {
          console.error(
            chalk.yellow('\\n💡 Tip:'),
            'The source account may not have enough tokens to transfer.'
          );
        }
      }

      process.exit(1);
    }
  });
