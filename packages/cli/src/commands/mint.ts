import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  createMintToTransaction,
  getMintInfo,
  decimalAmountToRaw,
} from '@mosaic/sdk';
import { createSolanaClient } from '../utils/rpc.js';
import { loadKeypair } from '../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';

interface MintOptions {
  mintAddress: string;
  recipient: string;
  amount: string;
  rpcUrl?: string;
  keypair?: string;
}

export const mintCommand = new Command('mint')
  .description('Mint tokens to a recipient address')
  .requiredOption(
    '-m, --mint-address <mint-address>',
    'The mint address of the token'
  )
  .requiredOption(
    '-r, --recipient <recipient>',
    'The recipient wallet address (ATA owner)'
  )
  .requiredOption(
    '-a, --amount <amount>',
    'The decimal amount to mint (e.g., 1.5)'
  )
  .showHelpAfterError()
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: cmd => cmd.name(),
  })
  .action(async (options: MintOptions, command) => {
    const spinner = ora('Minting tokens...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;

      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Load mint authority keypair (assuming it's the configured keypair)
      const mintAuthorityKeypair = await loadKeypair(keypairPath);

      spinner.text = 'Getting mint information...';

      // Get mint info to determine decimals
      const mintInfo = await getMintInfo(rpc, options.mintAddress as Address);
      const decimals = mintInfo.decimals;

      // Parse and validate amount
      const decimalAmount = parseFloat(options.amount);
      if (isNaN(decimalAmount) || decimalAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      // Convert decimal amount to raw amount
      const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

      spinner.text = 'Building mint transaction...';

      // Create mint transaction
      const transaction = await createMintToTransaction(
        rpc,
        options.mintAddress as Address,
        options.recipient as Address,
        rawAmount,
        mintAuthorityKeypair,
        mintAuthorityKeypair // Use same keypair as fee payer
      );

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Tokens minted successfully!');

      // Display results
      console.log(chalk.green('✅ Mint Transaction Successful'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(`   ${chalk.bold('Recipient:')} ${options.recipient}`);
      console.log(
        `   ${chalk.bold('Amount:')} ${decimalAmount} (${rawAmount.toString()} raw units)`
      );
      console.log(`   ${chalk.bold('Decimals:')} ${decimals}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      console.log(
        `   ${chalk.bold('Mint Authority:')} ${mintAuthorityKeypair.address}`
      );

      console.log(chalk.cyan('\\n🎯 Result:'));
      console.log(
        `   ${chalk.green('✓')} Associated Token Account created/updated`
      );
      console.log(
        `   ${chalk.green('✓')} ${decimalAmount} tokens minted to recipient`
      );
    } catch (error) {
      spinner.fail('Failed to mint tokens');
      console.error(
        chalk.red('\\n❌ Error:'),
        error instanceof Error ? error : 'Unknown error'
      );
      process.exit(1);
    }
  });
