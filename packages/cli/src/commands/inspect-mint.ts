import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createRpcClient } from '../utils/rpc.js';
import { type Address } from '@solana/kit';
import { inspectToken, type TokenInspectionResult, type TokenType } from '@solana/mosaic-sdk';

interface InspectMintOptions {
    mintAddress: string;
    rpcUrl?: string;
}

const TOKEN_TYPE_LABELS: Record<Exclude<TokenType, 'unknown'>, string> = {
    stablecoin: 'Stablecoin',
    'arcade-token': 'Arcade Token',
    'tokenized-security': 'Tokenized Security',
    mmf: 'Money Market Fund',
};

function formatLabel(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'None';
    if (value instanceof Uint8Array) {
        return Buffer.from(value).toString('base64');
    }
    if (value instanceof Map) {
        return [...value.entries()].map(([key, entry]) => `${key}=${entry}`).join(', ') || 'None';
    }
    if (typeof value === 'object') {
        const option = value as { __option?: unknown; value?: unknown };
        if (option.__option === 'Some') return formatValue(option.value);
        if (option.__option === 'None') return 'None';
        return JSON.stringify(value, (_key, entry) => (typeof entry === 'bigint' ? entry.toString() : entry));
    }
    return String(value);
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
    for (const [type, label] of Object.entries(TOKEN_TYPE_LABELS) as [TokenType, string][]) {
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
    if (inspection.scaledUiAmount?.multiplier !== undefined) {
        console.log(`   ${chalk.bold('Scaled UI Multiplier:')} ${inspection.scaledUiAmount.multiplier}`);
    }

    if (extensions.length > 0) {
        console.log(chalk.cyan('\n🔍 Extension Details:'));
        for (const ext of extensions) {
            console.log(`   ${chalk.bold(ext.name)}:`);
            for (const [key, value] of Object.entries(ext.details ?? {})) {
                if (key === '__kind') continue;
                console.log(`     ${formatLabel(key)}: ${formatValue(value)}`);
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
