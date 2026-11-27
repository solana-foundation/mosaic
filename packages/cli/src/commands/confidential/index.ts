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
import { mintCommand } from './mint.js';
import { burnCommand } from './burn.js';
import { applyPendingBurnCommand } from './apply-pending-burn.js';
import { updateSupplyCommand } from './supply.js';
import { addTxVersionOption } from './common.js';

/** Every subcommand that sends transactions; each one takes `--tx-version`. */
const sendingCommands = [
    configureAccountCommand,
    approveCommand,
    enableCreditsCommand,
    disableCreditsCommand,
    depositCommand,
    applyCommand,
    transferCommand,
    withdrawCommand,
    emptyAccountCommand,
    mintCommand,
    burnCommand,
    applyPendingBurnCommand,
    updateSupplyCommand,
];

export const confidentialCommand = new Command('confidential').description(
    'Confidential-transfer account operations (Token-2022 confidential balances)',
);
for (const command of sendingCommands) {
    confidentialCommand.addCommand(addTxVersionOption(command));
}
confidentialCommand.addCommand(inspectAccountCommand);
