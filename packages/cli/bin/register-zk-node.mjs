// Registers the zk-sdk resolve hook. Usable standalone for ad-hoc scripts:
//   node --import @solana/mosaic-cli/bin/register-zk-node.mjs script.mjs
import { register } from 'node:module';

register('./zk-node-resolve-hook.mjs', import.meta.url);
