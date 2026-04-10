import { resolve } from 'path';

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  plugins: [
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
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
});
