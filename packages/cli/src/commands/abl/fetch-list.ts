import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getList } from '@mosaic/sdk';
import { createRpcClient } from '../../utils/rpc.js';
import { type Address } from '@solana/kit';

interface CreateConfigOptions {
    list: string;
    rpcUrl?: string;
    keypair?: string;
}

export const fetchList = new Command('fetch-list')
    .description('Fetch a list')
    .requiredOption('-l, --list <list>', 'List address')
    .action(async (options: CreateConfigOptions, command) => {
        const spinner = ora('Fetching list...').start();

        try {
            const parentOpts = command.parent?.parent?.opts() || {};
            const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
            const rpc = createRpcClient(rpcUrl);

            const list = await getList({ rpc, listConfig: options.list as Address });
            spinner.succeed('Fetched list successfully!');

            // Display results
            console.log(chalk.green('✅ Lists fetched successfully!'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('List:')} ${list.listConfig}`);
            console.log(`   ${chalk.bold('Mode:')} ${list.mode}`);
            console.log(`   ${chalk.bold('Seed:')} ${list.seed}`);
            console.log(`   ${chalk.bold('Authority:')} ${list.authority}`);
            console.log(`   ${chalk.bold('Wallets:')} ${list.wallets.length > 0 ? list.wallets.join('\n') : 'none'}`);
        } catch (error) {
            spinner.fail('Failed to fetch ABL list');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');

            process.exit(1);
        }
    });
