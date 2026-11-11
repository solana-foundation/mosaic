/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/presets/default-esm',
    extensionsToTreatAsEsm: ['.ts'],
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
    testPathIgnorePatterns: [
        '/node_modules/',
        // Manual devnet harness: needs a funded keypair and real cluster access.
        // Run it explicitly with `jest -c jest.devnet.config.js`.
        '__devnet__',
        ...(process.env.SKIP_INTEGRATION === 'true' ? ['integration'] : []),
    ],
    // token-2022 >=0.17 depends on @noble/curves v2, which is ESM-only ("type":
    // "module", no CJS build). Its CJS bundle `require()`s it, which real Node
    // 20.19+/22.12+ handles via require(esm) but jest's CJS runtime does not.
    // Jest here runs in CJS mode (the suite relies on the `jest` global and
    // jest.mock), so the fix is to let jest transform @noble down to CJS rather
    // than to switch the whole suite to --experimental-vm-modules.
    transformIgnorePatterns: ['/node_modules/(?!.*@noble)'],
    transform: {
        // Down-level the ESM-only @noble packages (see transformIgnorePatterns).
        '^.+\\.js$': [
            'ts-jest',
            {
                useESM: false,
                tsconfig: {
                    allowJs: true,
                    module: 'commonjs',
                    moduleResolution: 'bundler',
                    target: 'es2022',
                },
            },
        ],
        '^.+\\.ts$': [
            'ts-jest',
            {
                useESM: true,
                // The package tsconfig targets `module: nodenext` for real Node
                // builds, but ts-jest's transpiler lacks the package-type context
                // to pick the ESM output format under nodenext and falls back to
                // CJS, which breaks ESM-mode jest. Pin the transform to classic
                // ESM emit; module resolution under jest is handled by jest
                // itself (see moduleNameMapper).
                tsconfig: {
                    module: 'esnext',
                    moduleResolution: 'bundler',
                },
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
        // Sources use explicit `.js` extensions on relative imports (Node ESM);
        // strip them so jest resolves back to the `.ts` sources.
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@/(.*)$': '<rootDir>/src/$1',
        // The confidential modules import the internal `@solana/mosaic-sdk/_zk`
        // indirection (resolved via package `exports` conditions in real builds);
        // under jest, resolve it to the node shim directly.
        '^@solana/mosaic-sdk/_zk$': '<rootDir>/src/confidential/_zk.node.ts',
        // NOTE: no '^@solana/zk-sdk/bundler$' remap is needed. token-2022 imports the
        // ESM+wasm bundler entry, but as of @solana/zk-sdk 0.5.2 that subpath carries a
        // `node` condition pointing at the CJS node build, which jest honours under
        // testEnvironment: 'node'. (Before 0.5.2 this was a local pnpm patch + a remap here.)
        '^@solana/token-acl-sdk$': '<rootDir>/src/__mocks__/@mosaic/token-acl.ts',
        '^@solana/token-acl-gate-sdk$': '<rootDir>/src/__mocks__/@mosaic/abl.ts',
        '^@mosaic/abl$': '<rootDir>/src/__mocks__/@mosaic/abl.ts',
        '^@mosaic/token-acl$': '<rootDir>/src/__mocks__/@mosaic/token-acl.ts',
        '^@mosaic/tlv-account-resolution$': '<rootDir>/../tlv-account-resolution/src',
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
