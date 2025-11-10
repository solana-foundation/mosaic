/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    ...(process.env.SKIP_INTEGRATION === 'true' ? ['integration'] : []),
  ],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**/*.test.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/setup.ts',
    '!src/**/__tests__/test-utils.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@token-acl/sdk$': '<rootDir>/src/__mocks__/@mosaic/token-acl.ts',
    '^@token-acl/abl-sdk$': '<rootDir>/src/__mocks__/@mosaic/abl.ts',
    '^@mosaic/abl$': '<rootDir>/src/__mocks__/@mosaic/abl.ts',
    '^@mosaic/token-acl$': '<rootDir>/src/__mocks__/@mosaic/token-acl.ts',
    '^@mosaic/tlv-account-resolution$':
      '<rootDir>/../tlv-account-resolution/src',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
