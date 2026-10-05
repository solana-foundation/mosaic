import { Command } from 'commander';
import { createList } from './create-list.js';
import { setExtraMetas } from './set-extra-metas.js';
import { fetchLists } from './fetch-lists.js';
import { fetchList } from './fetch-list.js';

export const ablCommand = new Command('abl')
    .addCommand(createList)
    .addCommand(fetchLists)
    .addCommand(fetchList)
    .addCommand(setExtraMetas);
