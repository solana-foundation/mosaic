import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: { jsx: true },
            },
            globals: {
                ...globals.browser,
                ...globals.node,
                React: 'readonly',
            },
        },
        plugins: {
            '@next/next': nextPlugin,
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            // Next.js rules
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,

            // React rules
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // TypeScript specific rules
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            'no-unused-vars': 'off', // Use TypeScript version instead

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
