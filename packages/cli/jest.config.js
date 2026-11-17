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
                // Same reason as packages/sdk/jest.config.js: under `module: nodenext` ts-jest
                // falls back to CJS emit and breaks ESM-mode jest, so pin classic ESM emit.
                tsconfig: {
                    module: 'esnext',
                    moduleResolution: 'bundler',
                },
            },
        ],
    },
    moduleNameMapper: {
        // Sources use explicit `.js` extensions on relative imports (Node ESM);
        // strip them so jest resolves back to the `.ts` sources.
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
};
