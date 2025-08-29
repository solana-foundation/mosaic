import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createMintToTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../utils/solana.js';
import { createNoopSigner, signTransactionMessageWithSigners, type Address } from 'gill';
import { maybeOutputRawTx } from '../utils/rawTx.js';

interface MintOptions {
  mintAddress: string;
  recipient: string;
  amount: string;
  rpcUrl?: string;
  keypair?: string;
  authority?: string;
  feePayer?: string;
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
  .option('--authority <address>', 'Mint authority address (for --raw-tx)')
  .option('--fee-payer <address>', 'Fee payer address (for --raw-tx)')
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
      const rawTx: string | undefined = parentOpts.rawTx;

      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Resolve authorities: support address-based for raw mode
      let mintAuthority: Address;
      let feePayer: Address;
      let signerKp: any | null = null;
      if (rawTx) {
        mintAuthority = (options.authority || (await getAddressFromKeypair(keypairPath))) as Address;
        feePayer = (options.feePayer || mintAuthority) as Address;
      } else {
        signerKp = await loadKeypair(keypairPath);
        mintAuthority = signerKp.address as Address;
        feePayer = signerKp.address as Address;
      }

      spinner.text = 'Getting mint information...';

      // Parse and validate amount
      const decimalAmount = parseFloat(options.amount);
      if (isNaN(decimalAmount) || decimalAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      // Convert decimal amount to raw amount

      spinner.text = 'Building mint transaction...';

      // Create mint transaction (accepts Address or signer)
      const transaction = await createMintToTransaction(
        rpc,
        options.mintAddress as Address,
        options.recipient as Address,
        decimalAmount,
        rawTx ? (mintAuthority as Address) : signerKp,
        rawTx ? (feePayer as Address) : signerKp
      );

      // If raw requested, output and exit
      if (maybeOutputRawTx(rawTx, transaction)) {
        spinner.succeed('Built unsigned transaction');
        return;
      }

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction = await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Tokens minted successfully!');

      // Display results
      console.log(chalk.green('✅ Mint Transaction Successful'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(`   ${chalk.bold('Recipient:')} ${options.recipient}`);
      console.log(`   ${chalk.bold('Amount:')} ${decimalAmount}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      console.log(`   ${chalk.bold('Mint Authority:')} ${mintAuthority}`);

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
        chalk.red('❌ Error:'),
        error instanceof Error ? error : 'Unknown error'
      );
      process.exit(1);
    }
  });
