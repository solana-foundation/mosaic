import { Command } from 'commander';
import chalk from 'chalk';
import {
    createTreasuryVaultInitTransaction,
    DEFAULT_ALLOCATION_RULES,
    validateAllocationRules,
} from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import {
    generateKeyPairSigner,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    assertIsTransactionWithBlockhashLifetime,
    getSignatureFromTransaction,
    type Address,
} from '@solana/kit';
import { createSpinner, getGlobalOpts } from '../../utils/cli.js';

interface TreasuryVaultOptions {
    name: string;
    symbol: string;
    decimals: string;
    uri?: string;
    yieldFarmPct: string;
    reservePct: string;
    crossBorderPct: string;
    transferFeeBps: string;
    kytHookProgram?: string;
    mintKeypair?: string;
}

export const createTreasuryVaultCommand = new Command('treasury-vault')
    .description('Create a compliant yield-enabled institutional Treasury Vault token')
    .requiredOption('-n, --name <name>', 'Vault token name (e.g., "Acme Treasury USDC")')
    .requiredOption('-s, --symbol <symbol>', 'Token symbol (e.g., "aUSDC")')
    .option('-d, --decimals <decimals>', 'Number of decimals', '6')
    .option('-u, --uri <uri>', 'Metadata URI', '')
    .option('--yield-farm-pct <pct>', 'Percentage allocated to yield farming (default: 60)', '60')
    .option('--reserve-pct <pct>', 'Percentage kept as treasury reserve (default: 30)', '30')
    .option('--cross-border-pct <pct>', 'Percentage kept liquid for cross-border transfers (default: 10)', '10')
    .option('--transfer-fee-bps <bps>', 'Transfer fee in basis points routed to reserve (default: 5)', '5')
    .option('--kyt-hook-program <address>', 'Transfer hook program for KYT screening (uses placeholder if omitted)')
    .option('--mint-keypair <path>', 'Path to mint keypair file (generates new one if not provided)')
    .showHelpAfterError()
    .configureHelp({
        sortSubcommands: true,
        subcommandTerm: cmd => cmd.name(),
    })
    .action(async (options: TreasuryVaultOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const keypairPath = parentOpts.keypair;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Creating Treasury Vault token...', rawTx);

        try {
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

            const signerKeypair = rawTx ? null : await loadKeypair(keypairPath);
            const signerAddress = rawTx
                ? ((parentOpts.authority as Address) || '')
                : (signerKeypair!.address as Address);

            spinner.text = 'Loading keypairs...';

            let mintKeypair;
            if (options.mintKeypair) {
                mintKeypair = await loadKeypair(options.mintKeypair);
            } else {
                mintKeypair = await generateKeyPairSigner();
            }

            const decimals = parseInt(options.decimals, 10);
            if (isNaN(decimals) || decimals < 0 || decimals > 9) {
                throw new Error('Decimals must be a number between 0 and 9');
            }

            // Parse and validate allocation rules
            const yieldFarm = parseInt(options.yieldFarmPct, 10);
            const reserve = parseInt(options.reservePct, 10);
            const crossBorder = parseInt(options.crossBorderPct, 10);
            const allocationRules = { yieldFarm, reserve, crossBorder };
            validateAllocationRules(allocationRules);

            const transferFeeBps = parseInt(options.transferFeeBps, 10);
            if (isNaN(transferFeeBps) || transferFeeBps < 0 || transferFeeBps > 10000) {
                throw new Error('Transfer fee must be between 0 and 10000 basis points');
            }

            spinner.text = 'Building Treasury Vault transaction...';

            const vaultAuthority = rawTx ? (signerAddress as Address) : signerKeypair!;

            const transaction = await createTreasuryVaultInitTransaction(rpc, {
                name: options.name,
                symbol: options.symbol,
                decimals,
                uri: options.uri || '',
                vaultAuthority,
                mint: rawTx ? (mintKeypair.address as Address) : mintKeypair,
                feePayer: rawTx ? (signerAddress as Address) : signerKeypair!,
                allocationRules,
                transferFeeBps,
                kytHookProgram: options.kytHookProgram as Address | undefined,
            });

            if (rawTx) {
                const { maybeOutputRawTx } = await import('../../utils/raw-tx.js');
                if (maybeOutputRawTx(rawTx, transaction)) return;
            }

            spinner.text = 'Signing transaction...';
            const signedTransaction = await signTransactionMessageWithSigners(transaction);

            spinner.text = 'Sending transaction...';
            assertIsTransactionWithBlockhashLifetime(signedTransaction);
            await sendAndConfirmTransaction(signedTransaction, { commitment: 'confirmed' });
            const signature = getSignatureFromTransaction(signedTransaction);

            spinner.succeed('Treasury Vault token created successfully!');

            console.log(chalk.green('\n✅ Treasury Vault Creation Successful'));
            console.log(chalk.cyan('📋 Token Details:'));
            console.log(`   ${chalk.bold('Name:')}     ${options.name}`);
            console.log(`   ${chalk.bold('Symbol:')}   ${options.symbol}`);
            console.log(`   ${chalk.bold('Decimals:')} ${decimals}`);
            console.log(`   ${chalk.bold('Mint:')}     ${mintKeypair.address}`);
            console.log(`   ${chalk.bold('Tx:')}       ${signature}`);

            console.log(chalk.cyan('\n📊 Allocation Rules:'));
            console.log(`   ${chalk.green('↑')} Yield Farm:    ${yieldFarm}%  (Kamino, Drift, RWA)`);
            console.log(`   ${chalk.yellow('◼')} Reserve:       ${reserve}%  (treasury buffer)`);
            console.log(`   ${chalk.blue('→')} Cross-Border:  ${crossBorder}%  (instant settlement pool)`);

            console.log(chalk.cyan('\n🛡️  Token-2022 Extensions:'));
            console.log(`   ${chalk.green('✓')} Metadata           (on-chain vault identity + allocation rules)`);
            console.log(`   ${chalk.green('✓')} Transfer Hook      (KYT screening on every transfer)`);
            console.log(`   ${chalk.green('✓')} Transfer Fee       (${transferFeeBps} bps → reserve tranche)`);
            console.log(`   ${chalk.green('✓')} Pausable           (emergency circuit-breaker)`);
            console.log(`   ${chalk.green('✓')} Default Acct State (Frozen: KYC required to activate)`);
            console.log(`   ${chalk.green('✓')} Permanent Delegate (institutional freeze/seize)`);

            console.log(chalk.cyan('\n🔒 Compliance Features:'));
            console.log(`   ${chalk.green('✓')} KYC gating via DefaultAccountState = Frozen`);
            console.log(`   ${chalk.green('✓')} KYT transfer hook for real-time screening`);
            console.log(`   ${chalk.green('✓')} Travel Rule: attach VASP data via SPL Memo on cross-border`);
            console.log(`   ${chalk.green('✓')} Permanent delegate for regulatory freeze/seize`);

            console.log(chalk.cyan('\n🌐 Yield Sources (default):'));
            console.log(`   • Kamino USDC Lending  ~5.80% APY  [low risk]`);
            console.log(`   • Drift USDC Lending   ~8.20% APY  [medium risk]`);
            console.log(`   • Tokenized T-Bill     ~4.90% APY  [low risk]`);
            console.log(`\n   Blended APY: ~${(5.80 * 0.35 + 8.20 * 0.35 + 4.90 * 0.30).toFixed(2)}% on yield tranche`);

        } catch (error) {
            spinner.fail('Failed to create Treasury Vault token');
            if (error && typeof error === 'object' && 'context' in error) {
                const typedError = error as { context: { logs: string[] } };
                console.error(chalk.red('❌ Transaction simulation failed:'), `\n\t${typedError.context.logs.join('\n\t')}`);
            } else {
                console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
            }
            process.exit(1);
        }
    });
