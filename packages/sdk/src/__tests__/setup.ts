// Global test setup
// This file will be executed before each test file

import { webcrypto } from 'node:crypto';

// Ensure WebCrypto is available in Node test environment (CI may lack global crypto)
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(globalThis as any).crypto) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).crypto = webcrypto;
  }
} catch {
  // ignore; test environment will fail fast if crypto is truly unavailable
}
