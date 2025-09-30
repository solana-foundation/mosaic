import { Command } from 'commander';
import { createList } from './createList.js';
import { setExtraMetas } from './setExtraMetas.js';
import { fetchLists } from './fetchLists.js';
import { fetchList } from './fetchList.js';

export const ablCommand = new Command('abl')
  .addCommand(createList)
  .addCommand(fetchLists)
  .addCommand(fetchList)
  .addCommand(setExtraMetas);
