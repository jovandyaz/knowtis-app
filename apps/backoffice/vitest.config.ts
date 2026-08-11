import { resolve } from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // @nx/vitest swallows the default reporter, so a failure surfaces as a bare
    // exit code with no test name or assertion.
    reporters: ['default'],
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
      '@knowtis/data-access-admin': resolve(
        __dirname,
        '../../libs/data-access/admin/src/index.ts'
      ),
      '@knowtis/api-client': resolve(
        __dirname,
        '../../libs/api-client/src/index.ts'
      ),
      '@knowtis/shared-util': resolve(
        __dirname,
        '../../packages/shared/util/src/index.ts'
      ),
      '@knowtis/shared-types': resolve(
        __dirname,
        '../../packages/shared/types/src/index.ts'
      ),
      '@knowtis/data-access-feature-flags': resolve(
        __dirname,
        '../../libs/data-access/feature-flags/src/index.ts'
      ),
      '@knowtis/shared-hooks': resolve(
        __dirname,
        '../../packages/shared/hooks/src/index.ts'
      ),
    },
  },
});
