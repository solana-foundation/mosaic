import { Command } from 'commander';
import { createList } from './createList';
import { setExtraMetas } from './setExtraMetas';
import { fetchLists } from './fetchLists';
import { fetchList } from './fetchList';

export const ablCommand = new Command('abl')
  .addCommand(createList)
  .addCommand(fetchLists)
  .addCommand(fetchList)
  .addCommand(setExtraMetas);
