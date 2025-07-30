import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createSolanaClient } from '../utils/rpc.js';
import { type Address } from 'gill';
import { TOKEN_2022_PROGRAM_ADDRESS, decodeMint } from 'gill/programs/token';
import { fetchEncodedAccount } from '@solana/accounts';

interface InspectMintOptions {
  mintAddress: string;
  rpcUrl?: string;
}

// Define expected extensions for each token type
const STABLECOIN_EXTENSIONS = [
  'TokenMetadata',
  'PermanentDelegate',
  'DefaultAccountState',
  'ConfidentialTransferMint',
];

const ARCADE_TOKEN_EXTENSIONS = [
  'TokenMetadata',
  'PermanentDelegate',
  'DefaultAccountState',
];

export const inspectMintCommand = new Command('inspect-mint')
  .description('Inspect a token mint and display its extensions')
  .requiredOption('-m, --mint-address <address>', 'The mint address to inspect')
  .showHelpAfterError()
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: cmd => cmd.name(),
  })
  .action(async (options: InspectMintOptions, command) => {
    const spinner = ora('Fetching mint information...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;

      // Create Solana client
      const { rpc } = createSolanaClient(rpcUrl);

      spinner.text = 'Loading mint account...';

      // Fetch account using @solana/kit
      const mintAddress = options.mintAddress as Address;
      const encodedAccount = await fetchEncodedAccount(rpc, mintAddress);

      if (!encodedAccount.exists) {
        throw new Error('Mint account not found');
      }

      // Check if this is a Token-2022 mint
      if (encodedAccount.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
        throw new Error(
          `Not a Token-2022 mint (owner: ${encodedAccount.programAddress})`
        );
      }

      spinner.text = 'Parsing mint data...';

      // Decode mint data using gill's decodeMint
      const decodedMint = decodeMint(encodedAccount);

      // Get extensions
      const presentExtensions: string[] = [];
      let metadata = null;

      if (
        decodedMint.data.extensions &&
        decodedMint.data.extensions.__option === 'Some'
      ) {
        for (const ext of decodedMint.data.extensions.value) {
          if (ext.__kind) {
            presentExtensions.push(ext.__kind);

            // Check for metadata
            if (ext.__kind === 'TokenMetadata') {
              metadata = ext;
            }
          }
        }
      }

      // Check if token is pausable (has freeze authority)
      const isPausable =
        decodedMint.data.freezeAuthority &&
        decodedMint.data.freezeAuthority.__option === 'Some';

      if (isPausable && !presentExtensions.includes('Pausable')) {
        presentExtensions.push('Pausable');
      }

      spinner.succeed('Mint information loaded!');

      // Display results
      console.log(chalk.cyan('\n📋 Mint Details:'));
      console.log(`   ${chalk.bold('Address:')} ${mintAddress}`);
      console.log(`   ${chalk.bold('Decimals:')} ${decodedMint.data.decimals}`);
      console.log(`   ${chalk.bold('Supply:')} ${decodedMint.data.supply}`);
      console.log(
        `   ${chalk.bold('Is Initialized:')} ${decodedMint.data.isInitialized}`
      );

      if (
        decodedMint.data.mintAuthority &&
        decodedMint.data.mintAuthority.__option === 'Some'
      ) {
        console.log(
          `   ${chalk.bold('Mint Authority:')} ${decodedMint.data.mintAuthority.value}`
        );
      } else {
        console.log(
          `   ${chalk.bold('Mint Authority:')} ${chalk.gray('None (minting disabled)')}`
        );
      }

      if (
        decodedMint.data.freezeAuthority &&
        decodedMint.data.freezeAuthority.__option === 'Some'
      ) {
        console.log(
          `   ${chalk.bold('Freeze Authority:')} ${decodedMint.data.freezeAuthority.value}`
        );
      }

      // Display metadata if available
      if (metadata && metadata.__kind === 'TokenMetadata') {
        console.log(chalk.cyan('\n📝 Metadata:'));
        if (metadata.name)
          console.log(`   ${chalk.bold('Name:')} ${metadata.name}`);
        if (metadata.symbol)
          console.log(`   ${chalk.bold('Symbol:')} ${metadata.symbol}`);
        if (metadata.uri)
          console.log(`   ${chalk.bold('URI:')} ${metadata.uri}`);
        if (metadata.mint)
          console.log(`   ${chalk.bold('Mint:')} ${metadata.mint}`);
        if (metadata.updateAuthority) {
          console.log(
            `   ${chalk.bold('Update Authority:')} ${metadata.updateAuthority.__option === 'Some' ? metadata.updateAuthority.value.toString() : 'None'}`
          );
        }
        if (
          metadata.additionalMetadata &&
          metadata.additionalMetadata.size > 0
        ) {
          console.log(`   ${chalk.bold('Additional Metadata:')}`);
          for (const [key, value] of metadata.additionalMetadata.entries()) {
            console.log(`     ${key}: ${value}`);
          }
        }
      }

      // Display extensions
      console.log(chalk.cyan('\n🔧 Token Extensions:'));
      if (presentExtensions.length === 0) {
        console.log(`   ${chalk.gray('No extensions found')}`);
      } else {
        presentExtensions.sort().forEach(ext => {
          console.log(`   ${chalk.green('✓')} ${ext}`);
        });
      }

      // Check if it matches stablecoin or arcade token pattern
      console.log(chalk.cyan('\n🎯 Token Type Detection:'));

      const isStablecoin =
        STABLECOIN_EXTENSIONS.every(ext => presentExtensions.includes(ext)) &&
        isPausable;

      const isArcadeToken =
        ARCADE_TOKEN_EXTENSIONS.every(ext => presentExtensions.includes(ext)) &&
        !presentExtensions.includes('ConfidentialTransferMint') &&
        isPausable;

      if (isStablecoin) {
        console.log(
          `   ${chalk.green('✓')} Stablecoin (matches all required extensions)`
        );
      } else {
        console.log(`   ${chalk.red('✗')} Stablecoin`);
        const requiredWithPausable = [...STABLECOIN_EXTENSIONS, 'Pausable'];
        const missingStablecoin = requiredWithPausable.filter(
          ext => !presentExtensions.includes(ext)
        );
        if (missingStablecoin.length > 0) {
          console.log(
            `     ${chalk.gray('Missing:')} ${missingStablecoin.join(', ')}`
          );
        }
      }

      if (isArcadeToken) {
        console.log(
          `   ${chalk.green('✓')} Arcade Token (matches all required extensions)`
        );
      } else {
        console.log(`   ${chalk.red('✗')} Arcade Token`);
        const requiredWithPausable = [...ARCADE_TOKEN_EXTENSIONS, 'Pausable'];
        const missingArcade = requiredWithPausable.filter(
          ext => !presentExtensions.includes(ext)
        );
        if (missingArcade.length > 0) {
          console.log(
            `     ${chalk.gray('Missing:')} ${missingArcade.join(', ')}`
          );
        }
        if (presentExtensions.includes('ConfidentialTransferMint')) {
          console.log(
            `     ${chalk.gray('Has unexpected:')} ConfidentialTransferMint`
          );
        }
      }

      // Display extension details
      if (
        decodedMint.data.extensions &&
        decodedMint.data.extensions.__option === 'Some'
      ) {
        console.log(chalk.cyan('\n🔍 Extension Details:'));

        for (const ext of decodedMint.data.extensions.value) {
          if (!ext.__kind) continue;

          console.log(`   ${chalk.bold(ext.__kind)}:`);

          switch (ext.__kind) {
            case 'DefaultAccountState':
              if ('state' in ext) {
                console.log(`     State: ${ext.state}`);
              }
              break;
            case 'PermanentDelegate':
              if ('delegate' in ext) {
                console.log(`     Delegate: ${ext.delegate}`);
              }
              break;
            case 'ConfidentialTransferMint':
              if ('authority' in ext && ext.authority) {
                console.log(
                  `     Authority: ${ext.authority.__option === 'Some' ? ext.authority.value : 'None'}`
                );
              }
              if ('autoApproveNewAccounts' in ext) {
                console.log(`     Auto-approve: ${ext.autoApproveNewAccounts}`);
              }
              break;
            case 'TransferFeeConfig':
              if (
                'transferFeeConfigAuthority' in ext &&
                ext.transferFeeConfigAuthority
              ) {
                console.log(
                  `     Authority: ${ext.transferFeeConfigAuthority.__option === 'Some' ? ext.transferFeeConfigAuthority.value : 'None'}`
                );
              }
              if (
                'withdrawWithheldAuthority' in ext &&
                ext.withdrawWithheldAuthority
              ) {
                console.log(
                  `     Withdraw Authority: ${ext.withdrawWithheldAuthority.__option === 'Some' ? ext.withdrawWithheldAuthority.value : 'None'}`
                );
              }
              break;
            case 'MetadataPointer':
              if ('authority' in ext && ext.authority) {
                console.log(
                  `     Authority: ${ext.authority.__option === 'Some' ? ext.authority.value : 'None'}`
                );
              }
              if ('metadataAddress' in ext && ext.metadataAddress) {
                console.log(
                  `     Metadata Address: ${ext.metadataAddress.__option === 'Some' ? ext.metadataAddress.value : 'None'}`
                );
              }
              break;
            case 'TokenMetadata':
              if ('name' in ext) {
                console.log(`     Name: ${ext.name}`);
              }
              if ('symbol' in ext) {
                console.log(`     Symbol: ${ext.symbol}`);
              }
              if ('uri' in ext) {
                console.log(`     URI: ${ext.uri}`);
              }
              break;
            case 'PausableConfig':
              if ('authority' in ext && ext.authority) {
                console.log(
                  `     Authority: ${ext.authority.__option === 'Some' ? ext.authority.value : 'None'}`
                );
              }
              if ('paused' in ext) {
                console.log(`     Paused: ${ext.paused}`);
              }
              break;
          }
        }
      }
    } catch (error) {
      spinner.fail('Failed to inspect mint');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });
