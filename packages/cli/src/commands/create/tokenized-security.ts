import { Command } from 'commander';
import chalk from 'chalk';
import {
  ABL_PROGRAM_ID,
  TOKEN_ACL_PROGRAM_ID,
  createTokenizedSecurityInitTransaction,
} from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import {
  generateKeyPairSigner,
  signTransactionMessageWithSigners,
  type Address,
  type TransactionSigner,
} from 'gill';
import { findListConfigPda } from '@mosaic/abl';
import { findMintConfigPda } from '@mosaic/token-acl';
import { createSpinner, getGlobalOpts } from '../../utils/cli.js';

interface TokenizedSecuritiesOptions {
  name: string;
  symbol: string;
  decimals: string;
  uri?: string;
  aclMode?: 'allowlist' | 'blocklist';
  mintAuthority?: string;
  metadataAuthority?: string;
  pausableAuthority?: string;
  confidentialBalancesAuthority?: string;
  permanentDelegateAuthority?: string;
  multiplier?: string; // scaled UI amount multiplier
  scaledUiAmountAuthority?: string;
  enableSrfc37?: boolean;
  mintKeypair?: string;
}

export const createTokenizedSecurityCommand = new Command('tokenized-security')
  .description(
    'Create a new tokenized security with Token-2022 extensions (stablecoin set + Scaled UI Amount)'
  )
  .requiredOption('-n, --name <name>', 'Token name')
  .requiredOption('-s, --symbol <symbol>', 'Token symbol')
  .option('-d, --decimals <decimals>', 'Number of decimals', '6')
  .option('-u, --uri <uri>', 'Metadata URI', '')
  .option(
    '--acl-mode <allowlist|blocklist>',
    'Access control mode (defaults to blocklist)',
    'blocklist'
  )
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
  .option('--multiplier <number>', 'Scaled UI amount multiplier', '1')
  .option(
    '--mint-keypair <path>',
    'Path to mint keypair file (generates new one if not provided)'
  )
  .option(
    '--scaled-ui-amount-authority <address>',
    'Scaled UI amount authority address (defaults to mint authority)'
  )
  .option(
    '--enable-srfc37 <boolean>',
    'Enable SRFC-37 (defaults to false)',
    false
  )
  .showHelpAfterError()
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: cmd => cmd.name(),
  })
  .action(async (options: TokenizedSecuritiesOptions, command) => {
    const parentOpts = getGlobalOpts(command);
    const rpcUrl = parentOpts.rpcUrl;
    const rawTx: string | undefined = parentOpts.rawTx;
    const spinner = createSpinner('Creating tokenized security...', rawTx);

    try {
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      spinner.text = `Using RPC URL: ${rpcUrl}`;

      const signerKeypair = rawTx
        ? null
        : await loadKeypair(parentOpts.keypair);
      const signerAddress = rawTx
        ? (options.mintAuthority as Address)
        : (signerKeypair!.address as Address);

      let mintKeypair: TransactionSigner<string>;
      if (options.mintKeypair) {
        mintKeypair = await loadKeypair(options.mintKeypair);
      } else {
        mintKeypair = await generateKeyPairSigner();
      }

      const decimals = parseInt(options.decimals, 10);
      if (isNaN(decimals) || decimals < 0 || decimals > 9) {
        throw new Error('Decimals must be a number between 0 and 9');
      }

      const multiplier = Number(options.multiplier ?? '1');
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        throw new Error('Multiplier must be a positive number');
      }

      const mintAuthority = (options.mintAuthority || signerAddress) as Address;
      const metadataAuthority = (options.metadataAuthority ||
        mintAuthority) as Address;
      const pausableAuthority = (options.pausableAuthority ||
        mintAuthority) as Address;
      const confidentialBalancesAuthority =
        (options.confidentialBalancesAuthority || mintAuthority) as Address;
      const permanentDelegateAuthority = (options.permanentDelegateAuthority ||
        mintAuthority) as Address;
      const scaledUiAmountAuthority = (options.scaledUiAmountAuthority ||
        mintAuthority) as Address;
      spinner.text = 'Building transaction...';

      const transaction = await createTokenizedSecurityInitTransaction(
        rpc,
        options.name,
        options.symbol,
        decimals,
        options.uri || '',
        mintAuthority,
        rawTx ? (mintKeypair.address as Address) : mintKeypair,
        rawTx
          ? (signerAddress as Address)
          : (signerKeypair as TransactionSigner<string>),
        undefined, // freezeAuthority - TODO add argument for this
        {
          aclMode: options.aclMode,
          metadataAuthority,
          pausableAuthority,
          confidentialBalancesAuthority,
          permanentDelegateAuthority,
          scaledUiAmount: {
            authority: scaledUiAmountAuthority,
            multiplier,
          },
          enableSrfc37: options.enableSrfc37,
        }
      );

      if (rawTx) {
        const { maybeOutputRawTx } = await import('../../utils/rawTx.js');
        if (maybeOutputRawTx(rawTx, transaction)) {
          return;
        }
      }

      spinner.text = 'Signing transaction...';
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Tokenized security created successfully!');

      const listConfigPda = await findListConfigPda(
        { authority: mintAuthority, seed: mintKeypair.address },
        { programAddress: ABL_PROGRAM_ID }
      );
      const mintConfigPda = await findMintConfigPda(
        { mint: mintKeypair.address },
        { programAddress: TOKEN_ACL_PROGRAM_ID }
      );

      console.log(chalk.green('✅ Tokenized Security Creation Successful'));
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

      console.log(chalk.cyan('🧩 Token Extensions:'));
      console.log(`   ${chalk.green('✓')} Metadata`);
      console.log(`   ${chalk.green('✓')} Pausable`);
      console.log(`   ${chalk.green('✓')} Default Account State (Blocklist)`);
      console.log(`   ${chalk.green('✓')} Confidential Balances`);
      console.log(`   ${chalk.green('✓')} Permanent Delegate`);
      console.log(
        `   ${chalk.green('✓')} Scaled UI Amount (multiplier=${multiplier})`
      );

      if (options.uri) {
        console.log(`${chalk.bold('Metadata URI:')} ${options.uri}`);
      }

      const isAllowlist = options.aclMode === 'allowlist';
      const mode = isAllowlist ? 'Allowlist' : 'Blocklist';

      if (options.enableSrfc37) {
        console.log(chalk.cyan(`🔑 ${mode} Initialized via SRFC-37:`));
        console.log(
          `   ${chalk.green('✓')} ${mode} Address: ${listConfigPda[0]}`
        );
        console.log(
          `   ${chalk.green('✓')} SRFC-37 ${mode.toLowerCase()} mint config Address: ${mintConfigPda[0]}`
        );
      } else {
        console.log(chalk.cyan(`🔑 ${mode} Initialized:`));
        console.log(
          isAllowlist
            ? 'Allowlist managed via manual thawing of addresses'
            : 'Blocklist managed via manual feezing of addresses'
        );
      }
    } catch (error) {
      spinner.fail('Failed to create tokenized security');
      if (error && typeof error === 'object' && 'context' in error) {
        const typedError = error as { context: { logs: string[] } };
        console.error(
          chalk.red(`❌ Transaction simulation failed:`),
          `\n\t${typedError.context.logs.join('\n\t')}`
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
