import { resolve } from 'path';

import { tanstackRouter } from '@tanstack/router-plugin/vite';

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite';

// Deploys are prebuilt, and nothing else in index.html changes when only
// vercel.json does; a per-commit stamp makes browsers that revalidate it get a
// 200 with the new response headers instead of a 304 that keeps the old ones.
function stampRelease(release: string | undefined): Plugin {
  return {
    name: 'stamp-release',
    transformIndexHtml: () =>
      release
        ? [{ tag: 'meta', attrs: { name: 'release', content: release } }]
        : [],
  };
}

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/backoffice',
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    nxViteTsPaths(),
    stampRelease(process.env.GITHUB_SHA),
  ],
  build: {
    outDir: '../../dist/apps/backoffice',
    reportCompressedSize: true,
    emptyOutDir: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@': resolve(__dirname, './src'),
      '@knowtis/design-system/styles.css': resolve(
        __dirname,
        '../../packages/design-system/src/styles.css'
      ),
    },
  },
  server: {
    port: 4400,
    host: 'localhost',
    fs: {
      allow: [searchForWorkspaceRoot(__dirname)],
    },
  },
  preview: {
    port: 4401,
    host: 'localhost',
  },
});
