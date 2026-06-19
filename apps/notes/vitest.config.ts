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
      '@knowtis/shared-hooks': resolve(
        __dirname,
        '../../packages/shared/hooks/src/index.ts'
      ),
      '@knowtis/shared-util': resolve(
        __dirname,
        '../../packages/shared/util/src/index.ts'
      ),
      '@knowtis/data-access-notes': resolve(
        __dirname,
        '../../libs/data-access/notes/src/index.ts'
      ),
      '@knowtis/shared-types': resolve(
        __dirname,
        '../../packages/shared/types/src/index.ts'
      ),
      '@knowtis/api-client': resolve(
        __dirname,
        '../../libs/api-client/src/index.ts'
      ),
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
      '@knowtis/shared-i18n': resolve(
        __dirname,
        '../../packages/shared/i18n/src/index.ts'
      ),
      '@knowtis/editor-schema': resolve(
        __dirname,
        '../../packages/editor-schema/src/index.ts'
      ),
      '@knowtis/editor': resolve(
        __dirname,
        '../../packages/editor/src/index.ts'
      ),
      '@knowtis/crdt': resolve(__dirname, '../../packages/crdt/src/index.ts'),
      '@knowtis/data-access-feature-flags': resolve(
        __dirname,
        '../../libs/data-access/feature-flags/src/index.ts'
      ),
    },
  },
});
