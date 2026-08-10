import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
  plugins: [
    nxViteTsPaths(),
    swc.vite({
      module: { type: 'es6' },
      jsc: { target: 'es2022' },
    }),
  ],
});
