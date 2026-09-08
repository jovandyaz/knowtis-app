import { useEffect } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { RATING_ORDER, RATING_QUALITY } from '../constants/rating';
import { RatingBar, type RatingBarProps } from './RatingBar';

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

function WithKeysDemo({ onRate, ...rest }: RatingBarProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      const ratingKey = RATING_ORDER[Number(event.key) - 1];
      if (!ratingKey) {
        return;
      }
      onRate(RATING_QUALITY[ratingKey]);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRate]);

  return <RatingBar {...rest} onRate={onRate} />;
}

export const WithKeys: Story = {
  args: { showKeys: true },
  render: (args) => <WithKeysDemo {...args} />,
};

export const WithoutIntervals: Story = {
  args: { showIntervals: false },
};

export const Disabled: Story = {
  args: { disabled: true },
};
