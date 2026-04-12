import React from 'react';

import type { Preview } from '@storybook/react';

import '../src/styles.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#171717' },
      ],
    },
    docs: {
      toc: true,
    },
  },
  decorators: [
    (Story, context) => {
      const isDark = context.globals.backgrounds?.value === '#171717';
      return (
        <div className={isDark ? 'dark' : ''}>
          <Story />
        </div>
      );
    },
  ],
  tags: ['autodocs'],
};

export default preview;
