import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

const config = [
    // Extend Next.js config using compat
    ...compat.extends('next/core-web-vitals', 'next/typescript'),

    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        rules: {
            // TypeScript specific rules
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-explicit-any': 'warn',

            // General JavaScript rules
            'prefer-const': 'error',
            'no-var': 'error',
            'no-console': 'warn',
            'no-debugger': 'error',
            'no-duplicate-imports': 'error',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },

    {
        ignores: ['node_modules/', '.next/', 'out/', 'build/', 'dist/'],
    },
];

export default config;
