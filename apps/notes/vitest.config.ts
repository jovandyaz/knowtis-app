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
        '../../libs/design-system/src/index.ts'
      ),
      '@knowtis/shared-hooks': resolve(
        __dirname,
        '../../libs/shared/hooks/src/index.ts'
      ),
      '@knowtis/shared-util': resolve(
        __dirname,
        '../../libs/shared/util/src/index.ts'
      ),
      '@knowtis/data-access-notes': resolve(
        __dirname,
        '../../libs/data-access/notes/src/index.ts'
      ),
      '@knowtis/shared-types': resolve(
        __dirname,
        '../../libs/shared/types/src/index.ts'
      ),
      '@knowtis/api-client': resolve(
        __dirname,
        '../../libs/api-client/src/index.ts'
      ),
      '@knowtis/auth': resolve(__dirname, '../../libs/auth/src/index.ts'),
      '@knowtis/authorization': resolve(
        __dirname,
        '../../libs/authorization/src/index.ts'
      ),
      '@jovandyaz/permissions-core': resolve(
        __dirname,
        '../../packages/permissions/src/index.ts'
      ),
      '@jovandyaz/permissions-react': resolve(
        __dirname,
        '../../packages/permissions-react/src/index.ts'
      ),
      '@jovandyaz/auth': resolve(__dirname, '../../packages/auth/src/index.ts'),
      '@jovandyaz/auth-react': resolve(
        __dirname,
        '../../packages/auth-react/src/index.ts'
      ),
    },
  },
});
