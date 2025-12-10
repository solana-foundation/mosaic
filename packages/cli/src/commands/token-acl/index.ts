import { Command } from 'commander';
import { createConfig } from './create-config.js';
import { setGatingProgram } from './set-gating-program.js';
import { thawPermissionless } from './thaw-permissionless.js';
import { enablePermissionlessThaw } from './enable-permissionless-thaw.js';

export const tokenAclCommand = new Command('token-acl')
    .addCommand(createConfig)
    .addCommand(setGatingProgram)
    .addCommand(thawPermissionless)
    .addCommand(enablePermissionlessThaw);
