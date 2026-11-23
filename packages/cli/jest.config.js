/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/presets/default-esm',
    extensionsToTreatAsEsm: ['.ts'],
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                useESM: true,
                // Same override as packages/sdk/jest.config.js: ts-jest can't pick ESM output under nodenext
                tsconfig: {
                    module: 'esnext',
                    moduleResolution: 'bundler',
                },
            },
        ],
    },
    moduleNameMapper: {
        // Sources use explicit `.js` extensions on relative imports (Node ESM); resolve them to the `.ts` sources
        '^(\\.{1,2}/.*)\\.js$': '$1',
        // The SDK only exports an ESM `import` condition, which CommonJS jest can't resolve; test against its sources
        '^@solana/mosaic-sdk$': '<rootDir>/../sdk/src/index.ts',
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
};
