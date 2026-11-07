import { Command } from 'commander';
import chalk from 'chalk';
import { ABL_PROGRAM_ID, createStablecoinInitTransaction, TOKEN_ACL_PROGRAM_ID } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { loadKeypair, resolveSigners } from '../../utils/solana.js';
import { generateKeyPairSigner, type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { findListConfigPda } from '@solana/token-acl-gate-sdk';
import { findMintConfigPda } from '@solana/token-acl-sdk';
import { createSpinner, getGlobalOpts, sendOrOutputTransaction } from '../../utils/cli.js';

interface StablecoinOptions {
    name: string;
    symbol: string;
    decimals: string;
    uri?: string;
    mintAuthority?: string;
    metadataAuthority?: string;
    pausableAuthority?: string;
    aclMode?: 'allowlist' | 'blocklist';
    confidentialBalancesAuthority?: string;
    permanentDelegateAuthority?: string;
    enableSrfc37?: boolean;
    mintKeypair?: string;
}

export const createStablecoinCommand = new Command('stablecoin')
    .description('Create a new stablecoin with Token-2022 extensions')
    .requiredOption('-n, --name <name>', 'Token name')
    .requiredOption('-s, --symbol <symbol>', 'Token symbol')
    .option('-d, --decimals <decimals>', 'Number of decimals', '6')
    .option('-u, --uri <uri>', 'Metadata URI', '')
    .option('-a, --acl-mode <aclMode>', 'ACL mode (allowlist or blocklist)', 'blocklist')
    .option('--mint-authority <address>', 'Mint authority address (defaults to signer)')
    .option('--metadata-authority <address>', 'Metadata authority address (defaults to mint authority)')
    .option('--pausable-authority <address>', 'Pausable authority address (defaults to mint authority)')
    .option(
        '--confidential-balances-authority <address>',
        'Confidential balances authority address (defaults to mint authority)',
    )
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
    .action(async (options: StablecoinOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Creating stablecoin...', rawTx);

        try {
            // Create Solana client with sendAndConfirmTransaction
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
            spinner.text = `Using RPC URL: ${rpcUrl}`;

            spinner.text = 'Loading keypairs...';

            // The mint authority signs (metadata init requires it), so it is resolved as a signer:
            // --mint-authority, else --authority, else the --keypair signer.
            const { authority: mintAuthoritySigner, feePayer } = await resolveSigners(
                parentOpts,
                options.mintAuthority ?? parentOpts.authority,
                options.mintAuthority ? '--mint-authority' : '--authority',
            );

            // Generate or load the mint keypair; it always signs, in raw mode too
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

            // Set authorities (default to the mint authority if not provided)
            const mintAuthority = mintAuthoritySigner.address;
            const metadataAuthority = (options.metadataAuthority || mintAuthority) as Address;
            const pausableAuthority = (options.pausableAuthority || mintAuthority) as Address;
            const confidentialBalancesAuthority = (options.confidentialBalancesAuthority || mintAuthority) as Address;
            const permanentDelegateAuthority = (options.permanentDelegateAuthority || mintAuthority) as Address;

            spinner.text = 'Building transaction...';

            // Create stablecoin transaction
            const transaction = await createStablecoinInitTransaction(
                rpc,
                options.name,
                options.symbol,
                decimals,
                options.uri || '',
                mintAuthoritySigner,
                mintKeypair,
                feePayer,
                options.aclMode || 'blocklist',
                metadataAuthority,
                pausableAuthority,
                confidentialBalancesAuthority,
                permanentDelegateAuthority,
                options.enableSrfc37,
            );

            if (rawTx) {
                // stdout carries only the transaction; the new mint's address goes to stderr
                console.error(`Mint Address: ${mintKeypair.address}`);
            }
            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Stablecoin created successfully!');

            const listConfigPda = await findListConfigPda(
                { authority: mintAuthority, seed: mintKeypair.address },
                { programAddress: ABL_PROGRAM_ID },
            );

            const mintConfigPda = await findMintConfigPda(
                { mint: mintKeypair.address },
                { programAddress: TOKEN_ACL_PROGRAM_ID },
            );

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
            console.log(`   ${chalk.bold('Metadata Authority:')} ${metadataAuthority}`);
            console.log(`   ${chalk.bold('Pausable Authority:')} ${pausableAuthority}`);
            console.log(`   ${chalk.bold('Confidential Balances Authority:')} ${confidentialBalancesAuthority}`);
            console.log(`   ${chalk.bold('Permanent Delegate Authority:')} ${permanentDelegateAuthority}`);

            console.log(chalk.cyan('🛡️ Token Extensions:'));
            console.log(`   ${chalk.green('✓')} Metadata`);
            console.log(`   ${chalk.green('✓')} Pausable`);
            console.log(`   ${chalk.green('✓')} Default Account State (Blocklist)`);
            console.log(`   ${chalk.green('✓')} Confidential Balances`);
            console.log(`   ${chalk.green('✓')} Permanent Delegate`);

            if (options.uri) {
                console.log(`${chalk.bold('Metadata URI:')} ${options.uri}`);
            }

            const isAllowlist = options.aclMode === 'allowlist';
            const mode = isAllowlist ? 'Allowlist' : 'Blocklist';

            if (options.enableSrfc37) {
                console.log(chalk.cyan(`🔑 ${mode} Initialized via SRFC-37:`));
                console.log(`   ${chalk.green('✓')} ${mode} Address: ${listConfigPda[0]}`);
                console.log(
                    `   ${chalk.green('✓')} SRFC-37 ${mode.toLowerCase()} mint config Address: ${mintConfigPda[0]}`,
                );
            } else {
                console.log(chalk.cyan(`🔑 ${mode} Initialized:`));
                console.log(
                    isAllowlist
                        ? 'Allowlist managed via manual thawing of addresses'
                        : 'Blocklist managed via manual feezing of addresses',
                );
            }
        } catch (error) {
            spinner.fail('Failed to create stablecoin');
            // Not every error with a `context` (e.g. a Kit SolanaError) carries simulation logs
            const logs = (error as { context?: { logs?: unknown } } | undefined)?.context?.logs;
            if (Array.isArray(logs)) {
                console.error(chalk.red(`❌ Transaction simulation failed:`), `\n\t${logs.join('\n\t')}`);
            } else {
                console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
            }
            process.exit(1);
        }
    });
