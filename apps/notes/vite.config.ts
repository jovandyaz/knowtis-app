import { resolve } from 'path';

import { tanstackRouter } from '@tanstack/router-plugin/vite';

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/notes',
  define: {
    // Deploys are prebuilt in GitHub Actions, where Vercel's system variables
    // do not exist; a per-commit stamp also changes index.html on every deploy,
    // so browsers revalidating it pick up new response headers.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.GITHUB_SHA ?? ''
    ),
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: false,
      routeFileIgnorePattern: '\\.(test|spec)\\.',
    }),
    react(),
    tailwindcss(),
    // Uses tsconfig.base.json paths for @knowtis/* aliases
    nxViteTsPaths(),
  ],
  build: {
    outDir: '../../dist/apps/notes',
    reportCompressedSize: true,
    emptyOutDir: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      // Local app alias
      '@': resolve(__dirname, './src'),
      // CSS import needs explicit path (not handled by tsconfig)
      '@knowtis/design-system/styles.css': resolve(
        __dirname,
        '../../packages/design-system/src/styles.css'
      ),
    },
  },
  server: {
    port: 4200,
    host: 'localhost',
    fs: {
      allow: [searchForWorkspaceRoot(__dirname)],
    },
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
});
