import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';
import { configDefaults, defineConfig } from 'vitest/config';

const DB_SPECS = 'src/**/*.db.spec.ts';

/** Fresh instances per project: inline projects inherit no plugins from the root config, and path aliases and decorators break silently without these. */
const plugins = () => [
  nxViteTsPaths(),
  swc.vite({
    module: { type: 'es6' },
    jsc: { target: 'es2022' },
  }),
];

export default defineConfig({
  root: __dirname,
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Not redundant: @nx/vitest:test forces `reporters: []` unless the config
    // sets them, so failures reach CI with no name, file, or assertion.
    reporters: ['default'],
    // Each fork boots full Nest apps; concurrent forks exhaust CI runner memory.
    ...(process.env.CI ? { maxWorkers: 1 } : {}),
    // Specs that hit the real database share one schema, so parallel forks let
    // one spec's teardown delete another's fixtures mid-run.
    projects: [
      {
        plugins: plugins(),
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['src/**/*.{test,spec}.ts'],
          exclude: [...configDefaults.exclude, DB_SPECS],
        },
      },
      {
        plugins: plugins(),
        test: {
          name: 'database',
          globals: true,
          environment: 'node',
          include: [DB_SPECS],
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: '../../coverage/apps/api',
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 10,
        statements: 10,
      },
    },
    passWithNoTests: true,
  },
  plugins: plugins(),
});
