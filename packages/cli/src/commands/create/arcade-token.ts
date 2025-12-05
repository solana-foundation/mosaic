import { Command } from 'commander';
import chalk from 'chalk';
import { ABL_PROGRAM_ID, createArcadeTokenInitTransaction, TOKEN_ACL_PROGRAM_ID } from '@mosaic/sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import { generateKeyPairSigner, signTransactionMessageWithSigners, type Address, type TransactionSigner, sendAndConfirmTransactionFactory, assertIsTransactionWithBlockhashLifetime, getSignatureFromTransaction } from '@solana/kit';
import { findListConfigPda } from '@token-acl/abl-sdk';
import { findMintConfigPda } from '@token-acl/sdk';
import { createSpinner, getGlobalOpts } from '../../utils/cli.js';

interface ArcadeTokenOptions {
    name: string;
    symbol: string;
    decimals: string;
    uri?: string;
    mintAuthority?: string;
    metadataAuthority?: string;
    pausableAuthority?: string;
    permanentDelegateAuthority?: string;
    enableSrfc37?: boolean;
    mintKeypair?: string;
}

export const createArcadeTokenCommand = new Command('arcade-token')
    .description('Create a new arcade token with Token-2022 extensions')
    .requiredOption('-n, --name <name>', 'Token name')
    .requiredOption('-s, --symbol <symbol>', 'Token symbol')
    .option('-d, --decimals <decimals>', 'Number of decimals', '0')
    .option('-u, --uri <uri>', 'Metadata URI', '')
    .option('--mint-authority <address>', 'Mint authority address (defaults to signer)')
    .option('--metadata-authority <address>', 'Metadata authority address (defaults to mint authority)')
    .option('--pausable-authority <address>', 'Pausable authority address (defaults to mint authority)')
    .option(
        '--permanent-delegate-authority <address>',
        'Permanent delegate authority address (defaults to mint authority)',
    )
    .option('--mint-keypair <path>', 'Path to mint keypair file (generates new one if not provided)')
    .option('--enable-srfc37 <boolean>', 'Enable SRFC-37 (defaults to false)', false)
    .showHelpAfterError()
    .configureHelp({
        sortSubcommands: true,
        subcommandTerm: cmd => cmd.name(),
    })
    .action(async (options: ArcadeTokenOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Creating arcade token...', rawTx);

        try {
            // Create Solana client
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
            spinner.text = `Using RPC URL: ${rpcUrl}`;

            // Load signer and payer keypairs
            const signerKeypair = rawTx ? null : await loadKeypair(parentOpts.keypair);
            const signerAddress = rawTx ? (options.mintAuthority as Address) : (signerKeypair!.address as Address);

            // Generate or load mint keypair (must be a signer if not raw)
            let mintKeypair: TransactionSigner<string>;
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
            const metadataAuthority = (options.metadataAuthority || mintAuthority) as Address;
            const pausableAuthority = (options.pausableAuthority || mintAuthority) as Address;
            const permanentDelegateAuthority = (options.permanentDelegateAuthority || mintAuthority) as Address;

            spinner.text = 'Building transaction...';

            // Create arcade token transaction
            const transaction = await createArcadeTokenInitTransaction(
                rpc,
                options.name,
                options.symbol,
                decimals,
                options.uri || '',
                mintAuthority,
                rawTx ? mintKeypair.address : mintKeypair,
                rawTx ? signerAddress : signerKeypair!,
                metadataAuthority,
                pausableAuthority,
                permanentDelegateAuthority,
                options.enableSrfc37,
            );

            if (rawTx) {
                const { maybeOutputRawTx } = await import('../../utils/raw-tx.js');
                if (maybeOutputRawTx(rawTx, transaction)) {
                    return;
                }
            }

            spinner.text = 'Signing transaction...';

            // Sign the transaction
            const signedTransaction = await signTransactionMessageWithSigners(transaction);

            spinner.text = 'Sending transaction...';

            // Assert blockhash lifetime and send
            assertIsTransactionWithBlockhashLifetime(signedTransaction);
            await sendAndConfirmTransaction(signedTransaction, {
                skipPreflight: true,
                commitment: 'confirmed',
            });
            const signature = getSignatureFromTransaction(signedTransaction);

            spinner.succeed('Arcade token created successfully!');

            const listConfigPda = await findListConfigPda(
                { authority: mintAuthority, seed: mintKeypair.address },
                { programAddress: ABL_PROGRAM_ID },
            );
            const mintConfigPda = await findMintConfigPda(
                { mint: mintKeypair.address },
                { programAddress: TOKEN_ACL_PROGRAM_ID },
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
            console.log(`   ${chalk.bold('Metadata Authority:')} ${metadataAuthority}`);
            console.log(`   ${chalk.bold('Pausable Authority:')} ${pausableAuthority}`);
            console.log(`   ${chalk.bold('Permanent Delegate Authority:')} ${permanentDelegateAuthority}`);

            console.log(chalk.cyan('🎮 Token Extensions:'));
            console.log(`   ${chalk.green('✓')} Metadata (Rich Gaming Metadata)`);
            console.log(`   ${chalk.green('✓')} Pausable`);
            console.log(`   ${chalk.green('✓')} Default Account State (Allowlist)`);
            console.log(
                chalk.yellow(
                    '     ⚠️  You must add addresses to the allowlist for your arcade token to be usable by end users.',
                ),
            );
            console.log(`   ${chalk.green('✓')} Permanent Delegate`);

            if (options.uri) {
                console.log(`${chalk.bold('Metadata URI:')} ${options.uri}`);
            }

            if (options.enableSrfc37) {
                console.log(chalk.cyan(`🔑 Allowlist Initialized via SRFC-37:`));
                console.log(`   ${chalk.green('✓')} Allowlist Address: ${listConfigPda[0]}`);
                console.log(`   ${chalk.green('✓')} SRFC-37 Allowlist mint config Address: ${mintConfigPda[0]}`);
            } else {
                console.log(chalk.cyan(`🔑 Allowlist Initialized:`));
                console.log('Allowlist managed via manual thawing of addresses');
            }
        } catch (error) {
            if (!rawTx) {
                spinner.fail('Failed to create arcade token');
            }
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
            process.exit(1);
        }
    });
