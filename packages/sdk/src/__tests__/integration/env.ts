// Cluster endpoints and backend for the integration suites. The runner scripts
// (src/scripts/test-with-validator.js, test-with-surfpool.js) set these for the jest
// child; the defaults match a solana-test-validator on its default ports.

export const RPC_URL = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
export const WS_URL = process.env.SOLANA_WS_URL || 'ws://127.0.0.1:8900';

export type TestBackend = 'validator' | 'surfpool';

export const TEST_BACKEND: TestBackend = process.env.TEST_BACKEND === 'surfpool' ? 'surfpool' : 'validator';
