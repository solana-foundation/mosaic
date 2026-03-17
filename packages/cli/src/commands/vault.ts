/**
 * Vault management commands: status, allocate, cross-border transfer simulation.
 *
 * These commands operate on an existing Treasury Vault token mint and simulate
 * the allocation engine and cross-border transfer flow.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import {
    computeVaultAllocation,
    formatAllocation,
    DEFAULT_ALLOCATION_RULES,
    DEFAULT_YIELD_SOURCES,
    buildCrossBorderTransferMemo,
    formatCrossBorderSummary,
    getSimulatedFxRate,
    apyBpsToString,
    blendedApyBps,
    allocateToYieldSources,
    type AllocationRules,
    type SettlementRail,
} from '@solana/mosaic-sdk';
import { getGlobalOpts } from '../utils/cli.js';

// ─── vault status ─────────────────────────────────────────────────────────────

const vaultStatusCommand = new Command('status')
    .description('Show current allocation and yield simulation for a vault mint')
    .requiredOption('-m, --mint <address>', 'Treasury Vault mint address')
    .option('-b, --balance <amount>', 'Vault total balance (simulated, in token units)', '1000000')
    .option('-d, --decimals <n>', 'Token decimals', '6')
    .option('--yield-farm-pct <pct>', 'Yield farm allocation %', '60')
    .option('--reserve-pct <pct>', 'Reserve allocation %', '30')
    .option('--cross-border-pct <pct>', 'Cross-border allocation %', '10')
    .action((options, _command) => {
        const decimals = parseInt(options.decimals, 10);
        const balanceUnits = BigInt(Math.floor(parseFloat(options.balance) * 10 ** decimals));

        const rules: AllocationRules = {
            yieldFarm: parseInt(options.yieldFarmPct, 10),
            reserve: parseInt(options.reservePct, 10),
            crossBorder: parseInt(options.crossBorderPct, 10),
        };

        const allocation = computeVaultAllocation(balanceUnits, rules, DEFAULT_YIELD_SOURCES);
        const yieldAllocs = allocateToYieldSources(allocation.yieldFarmAmount, DEFAULT_YIELD_SOURCES);
        const blended = blendedApyBps(yieldAllocs, allocation.yieldFarmAmount);

        console.log(chalk.cyan(`\n📊 Treasury Vault Status`));
        console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
        console.log(`   ${chalk.bold('Total Balance:')} ${options.balance} tokens\n`);

        console.log(chalk.cyan('💰 Allocation:'));
        console.log(formatAllocation(allocation, decimals));

        console.log(chalk.cyan('\n📈 Yield Sources:'));
        for (const ys of DEFAULT_YIELD_SOURCES) {
            const indicator = ys.riskTier === 'low' ? chalk.green('●') : ys.riskTier === 'medium' ? chalk.yellow('●') : chalk.red('●');
            console.log(`   ${indicator} ${ys.name.padEnd(28)} APY: ${apyBpsToString(ys.apyBps)}  Risk: ${ys.riskTier}`);
        }
        console.log(`\n   ${chalk.bold('Blended APY on yield tranche:')} ${apyBpsToString(Math.round(blended))}`);

        const annualYield = Number(allocation.yieldFarmAmount) / 10 ** decimals * blended / 10000;
        console.log(`   ${chalk.bold('Estimated annual yield:')} ${annualYield.toFixed(2)} tokens`);
    });

// ─── vault allocate ───────────────────────────────────────────────────────────

const vaultAllocateCommand = new Command('allocate')
    .description('Simulate vault allocation for a given balance')
    .option('-b, --balance <amount>', 'Total balance in token units', '1000000')
    .option('-d, --decimals <n>', 'Token decimals', '6')
    .option('--yield-farm-pct <pct>', 'Yield farm %', '60')
    .option('--reserve-pct <pct>', 'Reserve %', '30')
    .option('--cross-border-pct <pct>', 'Cross-border %', '10')
    .action(options => {
        const decimals = parseInt(options.decimals, 10);
        const balanceUnits = BigInt(Math.floor(parseFloat(options.balance) * 10 ** decimals));
        const rules: AllocationRules = {
            yieldFarm: parseInt(options.yieldFarmPct, 10),
            reserve: parseInt(options.reservePct, 10),
            crossBorder: parseInt(options.crossBorderPct, 10),
        };

        const allocation = computeVaultAllocation(balanceUnits, rules, DEFAULT_YIELD_SOURCES);

        console.log(chalk.cyan('\n🔄 Vault Allocation Plan'));
        console.log(formatAllocation(allocation, decimals));
        console.log(chalk.green('\n✓ Allocation computed. Submit rebalance transactions to implement.'));
    });

// ─── vault cross-border ───────────────────────────────────────────────────────

const vaultCrossBorderCommand = new Command('cross-border')
    .description('Simulate a compliant cross-border transfer with FX and Travel Rule')
    .requiredOption('-r, --recipient <address>', 'Recipient wallet address')
    .requiredOption('-a, --amount <amount>', 'Amount in token units')
    .option('-d, --decimals <n>', 'Token decimals', '6')
    .option('--src-currency <code>', 'Source currency ISO-4217', 'USD')
    .option('--dst-currency <code>', 'Destination currency ISO-4217', 'EUR')
    .option('--sender-bic <bic>', 'Sender SWIFT BIC')
    .option('--receiver-bic <bic>', 'Receiver SWIFT BIC')
    .option('--purpose <code>', 'ISO-20022 purpose code (e.g., TRAD, SALA)', 'TRAD')
    .option('--rail <rail>', 'Settlement rail (solana_spl|swift_sim|sepa_sim|iso20022_sim)', 'solana_spl')
    .option('--travel-rule-threshold <amount>', 'Travel Rule threshold in token units', '1000')
    .action((options, _command) => {
        const decimals = parseInt(options.decimals, 10);
        const amountBaseUnits = BigInt(Math.floor(parseFloat(options.amount) * 10 ** decimals));
        const threshold = BigInt(Math.floor(parseFloat(options.travelRuleThreshold) * 10 ** decimals));

        const params = {
            amount: amountBaseUnits,
            recipient: options.recipient as import('@solana/kit').Address,
            sourceCurrency: options.srcCurrency,
            destinationCurrency: options.dstCurrency,
            senderBic: options.senderBic,
            receiverBic: options.receiverBic,
            purposeCode: options.purpose,
            rail: options.rail as SettlementRail,
        };

        const result = buildCrossBorderTransferMemo(params, threshold);
        console.log(chalk.cyan('\n🌐 Cross-Border Transfer Simulation'));
        console.log(formatCrossBorderSummary(params, result, decimals));
        console.log(chalk.cyan('\n📎 Memo Data (attach to SPL Memo instruction):'));
        console.log(chalk.dim(result.memoData));
        console.log(chalk.green('\n✓ Attach this memo alongside your token transfer instruction.'));
    });

// ─── vault fx-rate ────────────────────────────────────────────────────────────

const vaultFxRateCommand = new Command('fx-rate')
    .description('Show simulated FX rate between two currencies')
    .option('--from <currency>', 'Source currency', 'USD')
    .option('--to <currency>', 'Target currency', 'EUR')
    .action(options => {
        const rate = getSimulatedFxRate(options.from, options.to);
        console.log(chalk.cyan(`\n💱 FX Rate (Simulated)`));
        console.log(`   1 ${options.from.toUpperCase()} = ${rate.toFixed(4)} ${options.to.toUpperCase()}`);
        console.log(chalk.dim('\n   (Integrate Pyth or SIX Financial Data for live rates)'));
    });

// ─── vault (parent) ───────────────────────────────────────────────────────────

export const vaultCommand = new Command('vault')
    .description('Treasury Vault management: allocation, yield, and cross-border transfers')
    .addCommand(vaultStatusCommand)
    .addCommand(vaultAllocateCommand)
    .addCommand(vaultCrossBorderCommand)
    .addCommand(vaultFxRateCommand);
