import { Command } from 'commander';
import chalk from 'chalk';
import {
    ABL_PROGRAM_ID,
    createStablecoinInitTransaction,
    TOKEN_ACL_PROGRAM_ID,
    type ConfidentialApprovePolicy,
} from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import {
    generateKeyPairSigner,
    signTransactionMessageWithSigners,
    type Address,
    sendAndConfirmTransactionFactory,
    assertIsTransactionWithBlockhashLifetime,
    getSignatureFromTransaction,
} from '@solana/kit';
import { findListConfigPda } from '@solana/token-acl-gate-sdk';
import { findMintConfigPda } from '@token-acl/sdk';
import { createSpinner, getGlobalOpts } from '../../utils/cli.js';

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
    confidentialPolicy?: string;
    auditorElgamalPubkey?: string;
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
        '--confidential-policy <opt-in|whitelist>',
        'Confidential-transfer enable policy (defaults to whitelist)',
        'whitelist',
    )
    .option('--auditor-elgamal-pubkey <address>', 'Auditor ElGamal public key for confidential transfers (optional)')
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
        const keypairPath = parentOpts.keypair;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Creating stablecoin...', rawTx);

        try {
            // Create Solana client with sendAndConfirmTransaction
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
            spinner.text = `Using RPC URL: ${rpcUrl}`;

            // Default to the provided mint authority if raw tx, otherwise use keypair
            const signerKeypair = rawTx ? null : await loadKeypair(keypairPath);
            const signerAddress = rawTx ? (options.mintAuthority as Address) : (signerKeypair!.address as Address);

            spinner.text = 'Loading keypairs...';

            // Generate or load mint keypair (must be a signer if not raw)
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
            const metadataAuthority = (options.metadataAuthority || mintAuthority) as Address;
            const pausableAuthority = (options.pausableAuthority || mintAuthority) as Address;
            const confidentialBalancesAuthority = (options.confidentialBalancesAuthority || mintAuthority) as Address;
            const confidentialPolicy = (options.confidentialPolicy || 'whitelist') as ConfidentialApprovePolicy;
            if (confidentialPolicy !== 'opt-in' && confidentialPolicy !== 'whitelist') {
                throw new Error("--confidential-policy must be 'opt-in' or 'whitelist'");
            }
            const auditorElgamalPubkey = options.auditorElgamalPubkey as Address | undefined;
            const permanentDelegateAuthority = (options.permanentDelegateAuthority || mintAuthority) as Address;

            spinner.text = 'Building transaction...';

            // Create stablecoin transaction
            const transaction = await createStablecoinInitTransaction(
                rpc,
                options.name,
                options.symbol,
                decimals,
                options.uri || '',
                mintAuthority,
                rawTx ? (mintKeypair.address as Address) : mintKeypair,
                rawTx ? signerAddress : signerKeypair!,
                options.aclMode || 'blocklist',
                metadataAuthority,
                pausableAuthority,
                confidentialBalancesAuthority,
                permanentDelegateAuthority,
                options.enableSrfc37,
                undefined, // freezeAuthority
                confidentialPolicy,
                auditorElgamalPubkey,
            );

            if (rawTx) {
                const { maybeOutputRawTx } = await import('../../utils/raw-tx.js');
                if (maybeOutputRawTx(rawTx, transaction)) {
                    return;
                }
            }

            spinner.text = 'Signing transaction...';

            // Sign the transaction (buildTransaction includes signers but doesn't auto-sign)
            const signedTransaction = await signTransactionMessageWithSigners(transaction);

            spinner.text = 'Sending transaction...';

            // Assert blockhash lifetime and send
            assertIsTransactionWithBlockhashLifetime(signedTransaction);
            await sendAndConfirmTransaction(signedTransaction, { commitment: 'confirmed' });
            const signature = getSignatureFromTransaction(signedTransaction);

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
            console.log(`   ${chalk.bold('Confidential Policy:')} ${confidentialPolicy}`);
            if (auditorElgamalPubkey) {
                console.log(`   ${chalk.bold('Auditor ElGamal Pubkey:')} ${auditorElgamalPubkey}`);
            }
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
            if (error && typeof error === 'object' && 'context' in error) {
                const typedError = error as { context: { logs: string[] } };
                console.error(
                    chalk.red(`❌ Transaction simulation failed:`),
                    `\n\t${typedError.context.logs.join('\n\t')}`,
                );
            } else {
                console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
            }
            process.exit(1);
        }
    });
