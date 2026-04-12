import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-mcp'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (config) => {
    config.plugins = config.plugins || [];
    config.plugins.push(tailwindcss());

    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@knowtis/design-system': resolve(__dirname, '../src/index.ts'),
    };
    return config;
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
};

export default config;
