import { Command } from 'commander';
import { createList } from './createList.js';
import { setExtraMetas } from './setExtraMetas.js';

export const ablCommand = new Command('abl')
  .addCommand(createList)
  .addCommand(setExtraMetas);
