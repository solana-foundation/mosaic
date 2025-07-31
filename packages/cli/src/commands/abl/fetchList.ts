import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getList } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { type Address } from 'gill';

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
      const { rpc } = createSolanaClient(rpcUrl);

      const list = await getList({ rpc, listConfig: options.list as Address });

      // Display results
      console.log(chalk.green('✅ Lists fetched successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('List:')} ${list.listConfig}`);
      console.log(`   ${chalk.bold('Mode:')} ${list.mode}`);
      console.log(`   ${chalk.bold('Seed:')} ${list.seed}`);
      console.log(`   ${chalk.bold('Authority:')} ${list.authority}`);
      console.log(`   ${chalk.bold('Wallets:')} ${list.wallets.join('\n')}`);
    } catch (error) {
      spinner.fail('Failed to create ABL list');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );

      process.exit(1);
    }
  });
