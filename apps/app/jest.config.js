/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/presets/default-esm',
    extensionsToTreatAsEsm: ['.ts'],
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
    testPathIgnorePatterns: ['/node_modules/'],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                useESM: true,
                // The app tsconfig is for Next (jsx, incremental, the next plugin); the unit tests
                // only need plain ESM emit with bundler resolution.
                tsconfig: {
                    module: 'esnext',
                    moduleResolution: 'bundler',
                    isolatedModules: true,
                },
            },
        ],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
};
