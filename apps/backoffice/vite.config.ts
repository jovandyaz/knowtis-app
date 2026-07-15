import { resolve } from 'path';

import { tanstackRouter } from '@tanstack/router-plugin/vite';

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    nxViteTsPaths(),
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
  },
  preview: {
    port: 4401,
    host: 'localhost',
  },
});
