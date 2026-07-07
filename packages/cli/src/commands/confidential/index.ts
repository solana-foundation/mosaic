import { Command } from 'commander';
import { configureAccountCommand } from './configure-account.js';
import { approveCommand } from './approve.js';
import { enableCreditsCommand, disableCreditsCommand } from './credits.js';
import { depositCommand } from './deposit.js';
import { applyCommand } from './apply.js';
import { transferCommand } from './transfer.js';
import { withdrawCommand } from './withdraw.js';
import { emptyAccountCommand } from './empty-account.js';
import { inspectAccountCommand } from './inspect-account.js';

export const confidentialCommand = new Command('confidential')
    .description('Confidential-transfer account operations (Token-2022 confidential balances)')
    .addCommand(configureAccountCommand)
    .addCommand(approveCommand)
    .addCommand(enableCreditsCommand)
    .addCommand(disableCreditsCommand)
    .addCommand(depositCommand)
    .addCommand(applyCommand)
    .addCommand(transferCommand)
    .addCommand(withdrawCommand)
    .addCommand(emptyAccountCommand)
    .addCommand(inspectAccountCommand);
