// @ts-check
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
// eslint-plugin-playwright types are incomplete; cast via JS to access flat/recommended
const playwright = /** @type {any} */ (require('eslint-plugin-playwright'));
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  // Global ignores (replaces .eslintignore)
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'playwright-report/**', 'test-results/**'],
  },

  // TypeScript files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: ['./tsconfig.json'],
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },

  // Playwright rules scoped to test files
  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/**/*.ts'],
  },

  // Prettier (must be last to override formatting rules)
  prettierConfig,
  {
    plugins: { prettier: prettierPlugin },
    rules: { 'prettier/prettier': 'error' },
  },
];
