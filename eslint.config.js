import js from '@eslint/js';
import nxPlugin from '@nx/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist',
    '**/routeTree.gen.ts',
    'coverage',
    'tmp',
    '.nx',
    'node_modules',
  ]),
  // Nx module boundaries - enforces dependency constraints
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      '@nx': nxPlugin,
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            // Apps can depend on any library
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:data-access',
                'type:util',
              ],
            },
            // UI libraries can compose other UI libraries (e.g., editor → design-system).
            // The constraint that UI libraries cannot reach into data-access or app-tier
            // remains enforced.
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:util'],
            },
            // Data access libraries can depend on utilities and other data access
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: ['type:util', 'type:data-access'],
            },
            // Utility libraries can only depend on other utilities
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:util'],
            },
            // Scope constraints - shared can be used by anyone
            {
              sourceTag: 'scope:notes',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:notes'],
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:api'],
            },
          ],
        },
      ],
    },
  },
  // Base TypeScript config for all files
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strict,
      eslintConfigPrettier,
    ],
    languageOptions: {
      ecmaVersion: 2024,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // General code quality
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
    },
  },
  // React-specific config
  {
    files: [
      'apps/notes/**/*.{ts,tsx}',
      'libs/**/*.{ts,tsx}',
      'packages/**/*.{ts,tsx}',
    ],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // NestJS backend config - adjust rules for NestJS patterns
  {
    files: ['apps/api/**/*.ts', 'packages/*-nestjs/**/*.ts'],
    rules: {
      // Allow empty functions for NestJS decorators
      '@typescript-eslint/no-empty-function': 'off',
      // Allow any in DTOs with class-validator
      '@typescript-eslint/no-explicit-any': 'warn',
      // NestJS modules are empty classes with decorators
      '@typescript-eslint/no-extraneous-class': 'off',
      // CRITICAL: Disable consistent-type-imports for NestJS
      // NestJS DI requires actual class references at runtime, not type-only imports
      // Using 'import type' for injectable classes breaks dependency injection
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
]);
