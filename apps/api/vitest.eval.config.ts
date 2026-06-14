import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  resolve: {
    dedupe: ['@nestjs/core', '@nestjs/common', 'reflect-metadata'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.eval.ts'],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    passWithNoTests: true,
    server: {
      deps: {
        inline: [/@jovandyaz\/.*/, /@knowtis\/.*/],
      },
    },
  },
  plugins: [
    nxViteTsPaths(),
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
