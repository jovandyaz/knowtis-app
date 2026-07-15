import { resolve } from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@knowtis/design-system': resolve(
        __dirname,
        '../../packages/design-system/src/index.ts'
      ),
      '@jovandyaz/auth': resolve(__dirname, '../../packages/auth/src/index.ts'),
      '@jovandyaz/auth-react': resolve(
        __dirname,
        '../../packages/auth-react/src/index.ts'
      ),
    },
  },
});
