import { Command } from 'commander';
import { pauseCommand } from './pause';
import { resumeCommand } from './resume';
import { statusCommand } from './status';

export const controlCommand = new Command('control')
    .description('Control token operations (pause/resume)')
    .addCommand(pauseCommand)
    .addCommand(resumeCommand)
    .addCommand(statusCommand);
