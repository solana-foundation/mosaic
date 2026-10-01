import base from './jest.config.js';

// Integration config, used by src/scripts/test-with-validator.js and test-with-surfpool.js.
//
// The default config redirects @solana/token-acl-sdk and @solana/token-acl-gate-sdk to hand
// written mocks in src/__mocks__. That is right for unit tests, but an integration test that
// lands transactions on a cluster needs the real instruction builders, or the SRFC-37 paths it
// exercises are fake (stub PDAs, instructions with no accounts). As in jest.devnet.config.js,
// drop only those two mappings and keep everything else from the base config.
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
    testMatch: ['**/__tests__/integration/**/*.test.ts'],
};
