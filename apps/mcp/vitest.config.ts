import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // @nx/vitest:test injects `reporters: []` whenever the config it loads does
    // not set them, and a failure then reaches CI as a bare exit code. Measured:
    // silent in every project whose config the executor loads (`root`, `config`
    // or `configFile`); adding one to a project would silence it too.
    reporters: ['default'],
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
