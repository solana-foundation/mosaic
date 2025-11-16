import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getAllListConfigs } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';

interface CreateConfigOptions {
    rpcUrl?: string;
}

export const fetchLists = new Command('fetch-lists')
    .description('Fetch all lists')
    .action(async (options: CreateConfigOptions, command) => {
        const spinner = ora('Fetching lists...').start();

        try {
            const parentOpts = command.parent?.parent?.opts() || {};
            const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
            const { rpc } = createSolanaClient(rpcUrl);

            const lists = await getAllListConfigs({ rpc });
            spinner.succeed('Fetched lists successfully!');

            // Display results
            console.log(chalk.green('✅ Lists fetched successfully!'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Lists:')} ${lists.map(list => list.listConfig).join('\n')}`);
        } catch (error) {
            spinner.fail('Failed to fetch ABL lists');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');

            process.exit(1);
        }
    });
