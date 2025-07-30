import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createStablecoinInitTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import {
  generateKeyPairSigner,
  signTransactionMessageWithSigners,
  type Address,
} from 'gill';
// import {  } 

interface StablecoinOptions {
  name: string;
  symbol: string;
  decimals: string;
  uri?: string;
  mintAuthority?: string;
  metadataAuthority?: string;
  pausableAuthority?: string;
  confidentialBalancesAuthority?: string;
  permanentDelegateAuthority?: string;
  mintKeypair?: string;
  rpcUrl?: string;
  keypair?: string;
}

export const createStablecoinCommand = new Command('stablecoin')
  .description('Create a new stablecoin with Token-2022 extensions')
  .requiredOption('-n, --name <name>', 'Token name')
  .requiredOption('-s, --symbol <symbol>', 'Token symbol')
  .option('-d, --decimals <decimals>', 'Number of decimals', '6')
  .option('-u, --uri <uri>', 'Metadata URI', '')
  .option(
    '--mint-authority <address>',
    'Mint authority address (defaults to signer)'
  )
  .option(
    '--metadata-authority <address>',
    'Metadata authority address (defaults to mint authority)'
  )
  .option(
    '--pausable-authority <address>',
    'Pausable authority address (defaults to mint authority)'
  )
  .option(
    '--confidential-balances-authority <address>',
    'Confidential balances authority address (defaults to mint authority)'
  )
  .option(
    '--permanent-delegate-authority <address>',
    'Permanent delegate authority address (defaults to mint authority)'
  )
  .option(
    '--mint-keypair <path>',
    'Path to mint keypair file (generates new one if not provided)'
  )
  .showHelpAfterError()
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => cmd.name()
  })
  .action(async (options: StablecoinOptions, command) => {
    const spinner = ora('Creating stablecoin...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;

      // Create Solana client with sendAndConfirmTransaction
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Load signer keypair
      const signerKeypair = await loadKeypair(keypairPath);
      const signerAddress = signerKeypair.address;

      spinner.text = 'Loading keypairs...';

      // Generate or load mint keypair
      let mintKeypair;
      if (options.mintKeypair) {
        mintKeypair = await loadKeypair(options.mintKeypair);
      } else {
        mintKeypair = await generateKeyPairSigner();
      }

      // Parse decimals
      const decimals = parseInt(options.decimals, 10);
      if (isNaN(decimals) || decimals < 0 || decimals > 9) {
        throw new Error('Decimals must be a number between 0 and 9');
      }

      // Set authorities (default to signer if not provided)
      const mintAuthority = (options.mintAuthority || signerAddress) as Address;
      const metadataAuthority = (options.metadataAuthority ||
        mintAuthority) as Address;
      const pausableAuthority = (options.pausableAuthority ||
        mintAuthority) as Address;
      const confidentialBalancesAuthority =
        (options.confidentialBalancesAuthority || mintAuthority) as Address;
      const permanentDelegateAuthority = (options.permanentDelegateAuthority ||
        mintAuthority) as Address;

      spinner.text = 'Building transaction...';

      // Create stablecoin transaction
      const transaction = await createStablecoinInitTransaction(
        rpc,
        options.name,
        options.symbol,
        decimals,
        options.uri || '',
        mintAuthority,
        mintKeypair,
        signerKeypair,
        metadataAuthority,
        pausableAuthority,
        confidentialBalancesAuthority,
        permanentDelegateAuthority
      );

      spinner.text = 'Signing transaction...';

      // Sign the transaction (buildTransaction includes signers but doesn't auto-sign)
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Stablecoin created successfully!');

      // Display results
      console.log(chalk.green('✅ Stablecoin Creation Successful'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Name:')} ${options.name}`);
      console.log(`   ${chalk.bold('Symbol:')} ${options.symbol}`);
      console.log(`   ${chalk.bold('Decimals:')} ${decimals}`);
      console.log(`   ${chalk.bold('Mint Address:')} ${mintKeypair.address}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);

      console.log(chalk.cyan('🔐 Authorities:'));
      console.log(`   ${chalk.bold('Mint Authority:')} ${mintAuthority}`);
      console.log(
        `   ${chalk.bold('Metadata Authority:')} ${metadataAuthority}`
      );
      console.log(
        `   ${chalk.bold('Pausable Authority:')} ${pausableAuthority}`
      );
      console.log(
        `   ${chalk.bold('Confidential Balances Authority:')} ${confidentialBalancesAuthority}`
      );
      console.log(
        `   ${chalk.bold('Permanent Delegate Authority:')} ${permanentDelegateAuthority}`
      );

      console.log(chalk.cyan('🛡️ Token Extensions:'));
      console.log(`   ${chalk.green('✓')} Metadata`);
      console.log(`   ${chalk.green('✓')} Pausable`);
      console.log(`   ${chalk.green('✓')} Default Account State (Blocklist)`);
      console.log(`   ${chalk.green('✓')} Confidential Balances`);
      console.log(`   ${chalk.green('✓')} Permanent Delegate`);

      if (options.uri) {
        console.log(`${chalk.bold('Metadata URI:')} ${options.uri}`);
      }
    } catch (error) {
      spinner.fail('Failed to create stablecoin');
      if ('context' in (error as any)) {
        console.error(
          chalk.red(`❌ Transaction simulation failed:`),
          `\n\t${(error as any).context.logs.join('\n\t')}`
        );
      } else {
        console.error(
          chalk.red('❌ Error:'),
          error instanceof Error ? error.message : 'Unknown error'
        );

      }
      process.exit(1);
    }
  });
