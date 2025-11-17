import { Command } from 'commander';
import { createList } from './create-list';
import { setExtraMetas } from './set-extra-metas';
import { fetchLists } from './fetch-lists';
import { fetchList } from './fetch-list';

export const ablCommand = new Command('abl')
    .addCommand(createList)
    .addCommand(fetchLists)
    .addCommand(fetchList)
    .addCommand(setExtraMetas);
