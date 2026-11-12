import base from './jest.config.js';

// Devnet end-to-end config.
//
// The default config redirects @solana/token-acl-sdk and @solana/token-acl-gate-sdk to hand
// written mocks in src/__mocks__, which is right for unit tests but useless against a real
// cluster. Here we drop those two mappings so the real programs are used, while KEEPING the
// rest — notably the @solana/mosaic-sdk/_zk shim, which selects zk-sdk's Node WASM build.
const {
    '^@solana/token-acl-sdk$': _acl,
    '^@solana/token-acl-gate-sdk$': _gate,
    ...moduleNameMapper
} = base.moduleNameMapper;

/** @type {import('jest').Config} */
export default {
    ...base,
    moduleNameMapper,
    testPathIgnorePatterns: ['/node_modules/'],
    testMatch: ['**/__devnet__/**/*.test.ts'],
};
