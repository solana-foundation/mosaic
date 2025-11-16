import { Command } from 'commander';
import { createConfig } from './createConfig.js';
import { setGatingProgram } from './setGatingProgram.js';
import { thawPermissionless } from './thawPermissionless.js';
import { enablePermissionlessThaw } from './enablePermissionlessThaw.js';

export const tokenAclCommand = new Command('token-acl')
    .addCommand(createConfig)
    .addCommand(setGatingProgram)
    .addCommand(thawPermissionless)
    .addCommand(enablePermissionlessThaw);
