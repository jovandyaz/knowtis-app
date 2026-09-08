import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { RatingBar } from './RatingBar';

const meta: Meta<typeof RatingBar> = {
  title: 'Components/RatingBar',
  component: RatingBar,
  tags: ['autodocs'],
  args: {
    label: 'Rate this card',
    labels: { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' },
    formatInterval: (days: number) => (days < 1 ? '<10m' : `${days}d`),
    intervals: { again: 1, hard: 1, good: 6, easy: 15 },
    onRate: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof RatingBar>;

export const Default: Story = {};

export const FirstReview: Story = {
  args: { intervals: { again: 1, hard: 1, good: 1, easy: 1 } },
};

export const WithKeys: Story = {
  args: { showKeys: true },
};

export const WithoutIntervals: Story = {
  args: { showIntervals: false },
};

export const Disabled: Story = {
  args: { disabled: true },
};
