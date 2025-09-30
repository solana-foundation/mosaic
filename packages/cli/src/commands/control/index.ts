import { Command } from 'commander';
import { pauseCommand } from './pause.js';
import { resumeCommand } from './resume.js';
import { statusCommand } from './status.js';

export const controlCommand = new Command('control')
  .description('Control token operations (pause/resume)')
  .addCommand(pauseCommand)
  .addCommand(resumeCommand)
  .addCommand(statusCommand);
