/**
 * Compliance management commands: KYC approval, KYT screening, Travel Rule.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import {
    checkKycEligibility,
    registerKycRecord,
    createMockKycRecord,
    screenTransaction,
    buildTravelRulePayload,
    parseTravelRuleMemo,
    DEFAULT_TRAVEL_RULE_THRESHOLD_BASE_UNITS,
    type KycTier,
} from '@solana/mosaic-sdk';
import type { Address } from '@solana/kit';

// ─── compliance kyc-check ─────────────────────────────────────────────────────

const kycCheckCommand = new Command('kyc-check')
    .description('Check KYC eligibility for a wallet address')
    .requiredOption('-w, --wallet <address>', 'Wallet address to check')
    .option('-j, --jurisdictions <codes>', 'Allowed jurisdictions (comma-separated ISO-3166-1)', '')
    .option('-a, --amount <units>', 'Transfer amount in base units for tier limit check', '0')
    .action(options => {
        const jurisdictions = options.jurisdictions
            ? options.jurisdictions.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
        const amount = BigInt(options.amount);

        // Register a demo KYC record for the wallet so the check succeeds in simulation
        const mockRecord = createMockKycRecord(options.wallet as Address, 'standard', 'US');
        registerKycRecord(mockRecord);

        const result = checkKycEligibility(options.wallet as Address, jurisdictions, amount);

        console.log(chalk.cyan('\n🔍 KYC Eligibility Check'));
        console.log(`   ${chalk.bold('Wallet:')} ${options.wallet}`);

        if (result.allowed) {
            console.log(`   ${chalk.green('✓')} KYC Status: ${chalk.bold('APPROVED')}`);
            if (result.record) {
                console.log(`   ${chalk.bold('Tier:')}         ${result.record.tier}`);
                console.log(`   ${chalk.bold('Jurisdiction:')} ${result.record.jurisdiction}`);
                console.log(`   ${chalk.bold('Provider Ref:')} ${result.record.providerRef}`);
                console.log(`   ${chalk.bold('Expires:')}      ${new Date(result.record.expiresAt * 1000).toISOString().slice(0, 10)}`);
            }
        } else {
            console.log(`   ${chalk.red('✗')} KYC Status: ${chalk.bold('REJECTED')}`);
            console.log(`   ${chalk.bold('Reason:')} ${result.reason}`);
        }
    });

// ─── compliance kyc-approve (mock) ────────────────────────────────────────────

const kycApproveCommand = new Command('kyc-approve')
    .description('Register a mock KYC approval for a wallet (simulation only)')
    .requiredOption('-w, --wallet <address>', 'Wallet address to approve')
    .option('-t, --tier <tier>', 'KYC tier (basic|standard|enhanced)', 'standard')
    .option('-j, --jurisdiction <code>', 'Jurisdiction ISO-3166-1 alpha-2', 'US')
    .action(options => {
        const record = createMockKycRecord(
            options.wallet as Address,
            options.tier as KycTier,
            options.jurisdiction,
        );
        registerKycRecord(record);
        console.log(chalk.green('\n✅ KYC Record Registered (Simulation)'));
        console.log(`   ${chalk.bold('Wallet:')}       ${options.wallet}`);
        console.log(`   ${chalk.bold('Tier:')}         ${record.tier}`);
        console.log(`   ${chalk.bold('Jurisdiction:')} ${record.jurisdiction}`);
        console.log(`   ${chalk.bold('Status:')}       ${record.status}`);
        console.log(`   ${chalk.bold('Provider Ref:')} ${record.providerRef}`);
        console.log(chalk.dim('\n   In production: emit a Solana transaction to update the KYC PDA,'));
        console.log(chalk.dim('   then thaw the user\'s token account to allow transfers.'));
    });

// ─── compliance kyt-screen ────────────────────────────────────────────────────

const kytScreenCommand = new Command('kyt-screen')
    .description('Screen a transaction for compliance risk (KYT simulation)')
    .requiredOption('--sender <address>', 'Sender wallet address')
    .requiredOption('--receiver <address>', 'Receiver wallet address')
    .requiredOption('--amount <units>', 'Amount in token base units')
    .requiredOption('--mint <address>', 'Token mint address')
    .option('--cross-border', 'Mark as a cross-border transfer', false)
    .option('--memo <data>', 'Travel Rule memo attached to this transfer')
    .action(options => {
        const amountBaseUnits = BigInt(options.amount);

        const result = screenTransaction(
            {
                senderAddress: options.sender as Address,
                receiverAddress: options.receiver as Address,
                amountBaseUnits,
                mintAddress: options.mint as Address,
                isCrossBorder: options.crossBorder,
                travelRuleMemo: options.memo,
            },
            DEFAULT_TRAVEL_RULE_THRESHOLD_BASE_UNITS,
        );

        const riskColor =
            result.riskLevel === 'low'
                ? chalk.green
                : result.riskLevel === 'medium'
                  ? chalk.yellow
                  : chalk.red;

        console.log(chalk.cyan('\n🔎 KYT Transaction Screening'));
        console.log(`   ${chalk.bold('Decision:')}    ${result.allowed ? chalk.green('ALLOWED') : chalk.red('BLOCKED')}`);
        console.log(`   ${chalk.bold('Risk Level:')} ${riskColor(result.riskLevel.toUpperCase())}`);
        console.log(`   ${chalk.bold('Risk Score:')} ${result.riskScore}/100`);
        if (result.flags.length > 0) {
            console.log(`   ${chalk.bold('Flags:')}       ${result.flags.join(', ')}`);
        }
        console.log(`   ${chalk.bold('Recommendation:')} ${result.recommendation}`);
    });

// ─── compliance travel-rule ───────────────────────────────────────────────────

const travelRuleCommand = new Command('travel-rule')
    .description('Generate a Travel Rule payload for a cross-border transfer')
    .requiredOption('--amount <units>', 'Amount in token base units')
    .requiredOption('--originator-name <name>', 'Originator account holder name')
    .requiredOption('--originator-account <id>', 'Originator account identifier (on-chain address)')
    .requiredOption('--originator-vasp <name>', 'Originator VASP legal name')
    .requiredOption('--originator-country <code>', 'Originator VASP country (ISO-3166-1)')
    .requiredOption('--beneficiary-name <name>', 'Beneficiary account holder name')
    .requiredOption('--beneficiary-account <id>', 'Beneficiary account identifier')
    .requiredOption('--beneficiary-vasp <name>', 'Beneficiary VASP legal name')
    .requiredOption('--beneficiary-country <code>', 'Beneficiary VASP country (ISO-3166-1)')
    .option('--threshold <units>', 'Travel Rule threshold in base units', DEFAULT_TRAVEL_RULE_THRESHOLD_BASE_UNITS.toString())
    .action(options => {
        const amount = BigInt(options.amount);
        const threshold = BigInt(options.threshold);

        const result = buildTravelRulePayload(
            amount,
            {
                vasp: {
                    legalName: options.originatorVasp,
                    country: options.originatorCountry,
                },
                accountHolderName: options.originatorName,
                accountIdentifier: options.originatorAccount,
            },
            {
                vasp: {
                    legalName: options.beneficiaryVasp,
                    country: options.beneficiaryCountry,
                },
                accountHolderName: options.beneficiaryName,
                accountIdentifier: options.beneficiaryAccount,
            },
            threshold,
        );

        console.log(chalk.cyan('\n📋 Travel Rule Compliance'));

        if (!result.required) {
            console.log(chalk.green(`   ✓ Travel Rule NOT required (amount below threshold)`));
            console.log(`   Threshold: ${result.thresholdBaseUnits} base units`);
            return;
        }

        console.log(chalk.yellow(`   ⚠ Travel Rule REQUIRED (amount ≥ threshold)`));
        console.log(`   Threshold: ${result.thresholdBaseUnits} base units`);
        console.log(chalk.cyan('\n📎 Attach this JSON as SPL Memo data:'));
        console.log(chalk.dim(result.memoData));
        console.log(chalk.cyan('\n✓ Parsed:'));
        const parsed = parseTravelRuleMemo(result.memoData!);
        if (parsed) {
            console.log(`   Protocol:   ${parsed.protocol}`);
            console.log(`   Originator: ${parsed.originator.accountHolderName} @ ${parsed.originator.vasp.legalName}`);
            console.log(`   Beneficiary: ${parsed.beneficiary.accountHolderName} @ ${parsed.beneficiary.vasp.legalName}`);
        }
    });

// ─── compliance (parent) ─────────────────────────────────────────────────────

export const complianceCommand = new Command('compliance')
    .description('Compliance tools: KYC gating, KYT screening, Travel Rule')
    .addCommand(kycCheckCommand)
    .addCommand(kycApproveCommand)
    .addCommand(kytScreenCommand)
    .addCommand(travelRuleCommand);
