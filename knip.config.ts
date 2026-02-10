import type { KnipConfig } from 'knip';

/**
 * Knip configuration for dead code detection
 */
const config: KnipConfig = {
  entry: [
    'apps/api/src/main.ts',
    'apps/notes/src/main.tsx',
    'apps/notes/src/routes/**/*.tsx',
    'libs/*/src/index.ts',
    'libs/*/*/src/index.ts',
  ],
  project: [
    'apps/*/src/**/*.{ts,tsx}',
    'libs/*/src/**/*.{ts,tsx}',
    'libs/*/*/src/**/*.{ts,tsx}',
  ],
  // Path aliases from tsconfig.base.json
  paths: {
    '@/*': ['apps/notes/src/*'],
    '@knowtis/design-system': ['libs/design-system/src/index.ts'],
    '@knowtis/shared-hooks': ['libs/shared/hooks/src/index.ts'],
    '@knowtis/shared-util': ['libs/shared/util/src/index.ts'],
    '@knowtis/shared-types': ['libs/shared/types/src/index.ts'],
    '@knowtis/api-client': ['libs/api-client/src/index.ts'],
    '@knowtis/data-access-notes': ['libs/data-access/notes/src/index.ts'],
    '@knowtis/auth': ['libs/auth/src/index.ts'],
  },
  // Dependencies used in config files, as peer deps, or via dynamic strings
  // that knip cannot detect through static analysis
  ignoreDependencies: [
    '@tailwindcss/vite', // Used in vite.config.ts and .storybook/main.ts
    'tailwindcss', // Imported in CSS via @import 'tailwindcss'
    'lib0', // Peer dependency of yjs, y-protocols, y-indexeddb
    'pino-pretty', // Referenced as string in pino logger config
    '@nestjs/cli', // CLI tool for NestJS scaffolding
    '@nestjs/schematics', // Peer dependency of @nestjs/cli
    '@nestjs/testing', // Needed for API integration tests
    '@nx/nest', // Nx plugin for NestJS project inference
    '@nx/node', // Nx plugin for Node project inference
    '@nx/react', // Nx plugin for React project inference
    '@nx/web', // Nx plugin for web project inference
    '@nx/workspace', // Nx workspace plugin
    '@storybook/addon-docs', // Used in .storybook/main.ts
    '@storybook/react-vite', // Used in .storybook/main.ts
    '@swc/helpers', // Peer dependency of @swc/core
    '@vitejs/plugin-react-swc', // Used in vite.config.ts files
    '@testing-library/jest-dom', // Used in test setup.ts
    '@testing-library/react', // Used in test files
    '@testing-library/user-event', // Needed for component tests
    '@types/ws', // Peer dependency of webpack-dev-server
  ],
  ignore: [
    '**/*.spec.{ts,tsx}',
    '**/*.test.{ts,tsx}',
    'apps/notes/src/routeTree.gen.ts',
    '**/*.d.ts',
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.nx/**',
    '**/vite.config.ts',
    '**/vitest.config.{ts,mts}',
    '**/vitest.workspace.ts',
    '**/eslint.config.{js,mjs}',
    '**/drizzle.config.ts',
    '**/webpack.config.cjs',
    '**/project.json',
    '**/.storybook/**',
    'apps/api/src/modules/feature-flags/feature-flag.guard.ts',
    'libs/*/src/index.ts',
    'libs/*/*/src/index.ts',
    'libs/auth/src/*/index.ts',
    'apps/notes/src/components/*/index.ts',
    'apps/notes/src/*/index.ts',
    'apps/notes/src/test/setup.ts',
  ],
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
  },
};

export default config;
