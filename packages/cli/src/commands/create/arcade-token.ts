import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ABL_PROGRAM_ID, createArcadeTokenInitTransaction, EBALTS_PROGRAM_ID } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import {
  generateKeyPairSigner,
  signTransactionMessageWithSigners,
  type Address,
} from 'gill';
import { findListConfigPda } from '@mosaic/abl';
import { findMintConfigPda } from '@mosaic/ebalts';

interface ArcadeTokenOptions {
  name: string;
  symbol: string;
  decimals: string;
  uri?: string;
  mintAuthority?: string;
  metadataAuthority?: string;
  pausableAuthority?: string;
  permanentDelegateAuthority?: string;
  mintKeypair?: string;
  rpcUrl?: string;
  keypair?: string;
}

export const createArcadeTokenCommand = new Command('arcade-token')
  .description('Create a new arcade token with Token-2022 extensions')
  .requiredOption('-n, --name <name>', 'Token name')
  .requiredOption('-s, --symbol <symbol>', 'Token symbol')
  .option('-d, --decimals <decimals>', 'Number of decimals', '0')
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
    subcommandTerm: cmd => cmd.name(),
  })
  .action(async (options: ArcadeTokenOptions, command) => {
    const spinner = ora('Creating arcade token...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.parent?.opts() || {};
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
      const permanentDelegateAuthority = (options.permanentDelegateAuthority ||
        mintAuthority) as Address;

      spinner.text = 'Building transaction...';

      // Create arcade token transaction
      const transaction = await createArcadeTokenInitTransaction(
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
        undefined, // Arcade tokens don't use confidential balances
        permanentDelegateAuthority
      );

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction, {
        skipPreflight: true,
        commitment: 'confirmed',
      });

      spinner.succeed('Arcade token created successfully!');

      const listConfigPda = await findListConfigPda(
        { authority: mintAuthority, seed: mintKeypair.address },
        { programAddress: ABL_PROGRAM_ID }
      );
      const mintConfigPda = await findMintConfigPda(
        { mint: mintKeypair.address },
        { programAddress: EBALTS_PROGRAM_ID }
      );

      // Display results
      console.log(chalk.green('✅ Arcade Token Creation Successful'));
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
        `   ${chalk.bold('Permanent Delegate Authority:')} ${permanentDelegateAuthority}`
      );

      console.log(chalk.cyan('🎮 Token Extensions:'));
      console.log(`   ${chalk.green('✓')} Metadata (Rich Gaming Metadata)`);
      console.log(`   ${chalk.green('✓')} Pausable`);
      console.log(`   ${chalk.green('✓')} Default Account State (Allowlist)`);
      console.log(
        chalk.yellow(
          '     ⚠️  You must add addresses to the allowlist for your arcade token to be usable by end users.'
        )
      );
      console.log(`   ${chalk.green('✓')} Permanent Delegate`);

      if (options.uri) {
        console.log(`${chalk.bold('Metadata URI:')} ${options.uri}`);
      }

      console.log(chalk.cyan('🔑 Allowlist Initialized:'));
      console.log(`   ${chalk.green('✓')} Allowlist Address: ${listConfigPda[0]}`);
      console.log(`   ${chalk.green('✓')} EBALTS mint config Address: ${mintConfigPda[0]}`);

    } catch (error) {
      spinner.fail('Failed to create arcade token');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });
