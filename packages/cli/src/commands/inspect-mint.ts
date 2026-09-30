import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createRpcClient } from '../utils/rpc.js';
import { type Address } from '@solana/kit';
import {
    inspectToken,
    TOKEN_TYPE_LABELS,
    type TokenInspectionResult,
    type TokenType,
    type TransferFeeEntry,
} from '@solana/mosaic-sdk';

interface InspectMintOptions {
    mintAddress: string;
    rpcUrl?: string;
}

export function formatLabel(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

const BASIS_POINTS_KEY = /BasisPoints$|^currentRate$|^preUpdateAverageRate$/;
const TIMESTAMP_KEY = /Timestamp$/;
const BASE_UNIT_AMOUNT_KEYS = new Set(['maximumFee', 'withheldAmount']);
const TRANSFER_FEE_ENTRY_KEYS = new Set(['newerTransferFee', 'olderTransferFee']);

export function formatBasisPoints(bps: number): string {
    return `${bps} bps (${formatPercent(bps)})`;
}

export function formatPercent(bps: number): string {
    return `${(bps / 100).toFixed(2)}%`;
}

function toIsoDate(seconds: bigint | number): string | undefined {
    const date = new Date(Number(seconds) * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Unix seconds; 0 means nothing is scheduled
export function formatTimestamp(seconds: bigint | number): string {
    if (BigInt(seconds) === 0n) return '0 (not scheduled)';
    const iso = toIsoDate(seconds);
    return iso ? `${seconds} (${iso})` : String(seconds);
}

// Converts raw base units to a decimal-adjusted amount without losing bigint precision
export function formatTokenAmount(amount: bigint | number, decimals: number): string {
    const raw = BigInt(amount);
    const negative = raw < 0n;
    const abs = negative ? -raw : raw;
    const scale = 10n ** BigInt(decimals);
    const whole = abs / scale;
    const fraction = (abs % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function formatBaseUnits(amount: bigint | number, decimals: number): string {
    return `${amount} (${formatTokenAmount(amount, decimals)} at ${decimals} decimals)`;
}

// One line per fee entry: the epoch it takes effect from, its rate and its cap
export function formatTransferFeeEntry(fee: TransferFeeEntry, decimals?: number): string {
    const max = decimals === undefined ? String(fee.maximumFee) : formatBaseUnits(fee.maximumFee, decimals);
    return `${formatBasisPoints(fee.transferFeeBasisPoints)}, max ${max}, from epoch ${fee.epoch}`;
}

export function formatValue(value: unknown, key?: string, decimals?: number): string {
    if (value === null || value === undefined) return 'None';
    if (key !== undefined) {
        if (typeof value === 'number' && BASIS_POINTS_KEY.test(key)) return formatBasisPoints(value);
        if ((typeof value === 'bigint' || typeof value === 'number') && TIMESTAMP_KEY.test(key)) {
            return formatTimestamp(value);
        }
        if ((typeof value === 'bigint' || typeof value === 'number') && BASE_UNIT_AMOUNT_KEYS.has(key)) {
            return decimals === undefined ? String(value) : formatBaseUnits(value, decimals);
        }
        if (TRANSFER_FEE_ENTRY_KEYS.has(key) && value !== null && typeof value === 'object') {
            return formatTransferFeeEntry(value as TransferFeeEntry, decimals);
        }
    }
    if (value instanceof Uint8Array) {
        return Buffer.from(value).toString('base64');
    }
    if (value instanceof Map) {
        return [...value.entries()].map(([key, entry]) => `${key}=${entry}`).join(', ') || 'None';
    }
    if (typeof value === 'object') {
        const option = value as { __option?: unknown; value?: unknown };
        if (option.__option === 'Some') return formatValue(option.value, key, decimals);
        if (option.__option === 'None') return 'None';
        return JSON.stringify(value, (_key, entry) => (typeof entry === 'bigint' ? entry.toString() : entry));
    }
    return String(value);
}

// Summary lines for the Compliance block, derived from the typed inspection fields
export function formatRateSummaryLines(
    inspection: Pick<
        TokenInspectionResult,
        'scaledUiAmount' | 'transferFee' | 'interestBearing' | 'supplyInfo' | 'metadata'
    >,
): [string, string][] {
    const { scaledUiAmount, transferFee, interestBearing, supplyInfo } = inspection;
    const symbol = inspection.metadata?.symbol ? ` ${inspection.metadata.symbol}` : '';
    const lines: [string, string][] = [];
    if (scaledUiAmount?.multiplier !== undefined) {
        lines.push(['Scaled UI Multiplier', String(scaledUiAmount.multiplier)]);
    }
    if (
        scaledUiAmount?.newMultiplier !== undefined &&
        scaledUiAmount.newMultiplierEffectiveTimestamp !== undefined &&
        scaledUiAmount.newMultiplierEffectiveTimestamp > 0n
    ) {
        const { newMultiplierEffectiveTimestamp } = scaledUiAmount;
        const when = toIsoDate(newMultiplierEffectiveTimestamp) ?? String(newMultiplierEffectiveTimestamp);
        lines.push(['Scheduled Multiplier', `${scaledUiAmount.newMultiplier} at ${when}`]);
    }
    if (transferFee) {
        const max = formatTokenAmount(transferFee.maximumFee, supplyInfo.decimals);
        lines.push(['Transfer Fee', `${formatPercent(transferFee.transferFeeBasisPoints)} (max ${max}${symbol})`]);
        // SetTransferFee only takes effect two epochs later; until then the newer entry is pending
        const { newerTransferFee, currentEpoch } = transferFee;
        if (newerTransferFee.epoch > currentEpoch) {
            const newerMax = formatTokenAmount(newerTransferFee.maximumFee, supplyInfo.decimals);
            lines.push([
                'Scheduled Transfer Fee',
                `${formatPercent(newerTransferFee.transferFeeBasisPoints)} (max ${newerMax}${symbol}) from epoch ${newerTransferFee.epoch}`,
            ]);
        }
    }
    if (interestBearing) {
        lines.push(['Interest Rate', `${formatPercent(interestBearing.currentRate)} APR`]);
    }
    return lines;
}

function render(inspection: TokenInspectionResult): void {
    const { supplyInfo, authorities, metadata, extensions, detectedPatterns } = inspection;

    console.log(chalk.cyan('\n📋 Mint Details:'));
    console.log(`   ${chalk.bold('Address:')} ${inspection.address}`);
    console.log(`   ${chalk.bold('Decimals:')} ${supplyInfo.decimals}`);
    console.log(`   ${chalk.bold('Supply:')} ${supplyInfo.supply}`);
    console.log(`   ${chalk.bold('Is Initialized:')} ${supplyInfo.isInitialized}`);

    if (authorities.mintAuthority) {
        console.log(`   ${chalk.bold('Mint Authority:')} ${authorities.mintAuthority}`);
    } else {
        console.log(`   ${chalk.bold('Mint Authority:')} ${chalk.gray('None (minting disabled)')}`);
    }
    if (authorities.freezeAuthority) {
        console.log(`   ${chalk.bold('Freeze Authority:')} ${authorities.freezeAuthority}`);
    }

    if (metadata) {
        console.log(chalk.cyan('\n📝 Metadata:'));
        if (metadata.name) console.log(`   ${chalk.bold('Name:')} ${metadata.name}`);
        if (metadata.symbol) console.log(`   ${chalk.bold('Symbol:')} ${metadata.symbol}`);
        if (metadata.uri) console.log(`   ${chalk.bold('URI:')} ${metadata.uri}`);
        console.log(`   ${chalk.bold('Update Authority:')} ${formatValue(metadata.updateAuthority)}`);
        if (metadata.additionalMetadata && metadata.additionalMetadata.size > 0) {
            console.log(`   ${chalk.bold('Additional Metadata:')}`);
            for (const [key, value] of metadata.additionalMetadata.entries()) {
                console.log(`     ${key}: ${value}`);
            }
        }
    }

    console.log(chalk.cyan('\n🔧 Token Extensions:'));
    if (extensions.length === 0) {
        console.log(`   ${chalk.gray('No extensions found')}`);
    } else {
        extensions
            .map(ext => ext.name)
            .sort()
            .forEach(name => {
                console.log(`   ${chalk.green('✓')} ${name}`);
            });
    }

    console.log(chalk.cyan('\n🎯 Token Type Detection:'));
    for (const [type, label] of Object.entries(TOKEN_TYPE_LABELS).filter(([type]) => type !== 'unknown') as [
        TokenType,
        string,
    ][]) {
        const detected = detectedPatterns.includes(type);
        console.log(`   ${detected ? chalk.green('✓') : chalk.red('✗')} ${label}`);
    }
    if (detectedPatterns.includes('unknown')) {
        console.log(`     ${chalk.gray('No known token template pattern matched')}`);
    }

    console.log(chalk.cyan('\n🔒 Compliance:'));
    console.log(`   ${chalk.bold('Pausable:')} ${inspection.isPausable ? 'yes' : 'no'}`);
    console.log(`   ${chalk.bold('ACL Mode:')} ${inspection.aclMode}`);
    console.log(`   ${chalk.bold('SRFC-37 (Token ACL):')} ${inspection.enableSrfc37 ? 'enabled' : 'disabled'}`);
    for (const [label, value] of formatRateSummaryLines(inspection)) {
        console.log(`   ${chalk.bold(`${label}:`)} ${value}`);
    }

    if (extensions.length > 0) {
        console.log(chalk.cyan('\n🔍 Extension Details:'));
        for (const ext of extensions) {
            console.log(`   ${chalk.bold(ext.name)}:`);
            for (const [key, value] of Object.entries(ext.details ?? {})) {
                if (key === '__kind') continue;
                console.log(`     ${formatLabel(key)}: ${formatValue(value, key, supplyInfo.decimals)}`);
            }
        }
    }
}

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

            const rpc = createRpcClient(rpcUrl);

            spinner.text = 'Loading mint account...';
            const inspection = await inspectToken(rpc, options.mintAddress as Address);

            spinner.succeed('Mint information loaded!');
            render(inspection);
        } catch (error) {
            spinner.fail('Failed to inspect mint');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
            process.exit(1);
        }
    });
