import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { RatingBar } from './RatingBar';

const meta: Meta<typeof RatingBar> = {
  title: 'Components/RatingBar',
  component: RatingBar,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RatingBar>;

const LABELS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
const formatInterval = (days: number) => (days < 1 ? '<10m' : `${days}d`);

export const Default: Story = {
  args: {
    label: 'Rate this card',
    intervals: { again: 1, hard: 1, good: 6, easy: 15 },
    labels: LABELS,
    formatInterval,
    onRate: fn(),
  },
};

export const FirstReview: Story = {
  args: {
    label: 'Rate this card',
    intervals: { again: 1, hard: 1, good: 1, easy: 1 },
    labels: LABELS,
    formatInterval,
    onRate: fn(),
  },
};

export const WithKeys: Story = {
  args: {
    label: 'Rate this card',
    intervals: { again: 1, hard: 1, good: 6, easy: 15 },
    labels: LABELS,
    formatInterval,
    onRate: fn(),
    showKeys: true,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Rate this card',
    intervals: { again: 1, hard: 1, good: 6, easy: 15 },
    labels: LABELS,
    formatInterval,
    onRate: fn(),
    disabled: true,
  },
};
