#!/usr/bin/env node

import { Command } from 'commander';
import { createStablecoinCommand } from './commands/create/stablecoin.js';
import { createArcadeTokenCommand } from './commands/create/arcade-token.js';
import { mintCommand } from './commands/mint.js';

const program = new Command();

program
  .name('mosaic')
  .description('CLI for managing Token-2022 tokens with extensions')
  .version('0.1.0');

// Create command group
const createCommand = program
  .command('create')
  .description('Create new tokens with Token-2022 extensions');

// Add token creation commands
createCommand.addCommand(createStablecoinCommand);
createCommand.addCommand(createArcadeTokenCommand);

// Add token management commands
program.addCommand(mintCommand);

// Global options
program
  .option('--rpc-url <url>', 'Solana RPC URL', 'https://api.devnet.solana.com')
  .option(
    '--keypair <path>',
    'Path to keypair file (defaults to Solana CLI default)'
  );

program.parse(process.argv);
