import type { Meta, StoryObj } from '@storybook/react';

import { StatTile } from './StatTile';

const meta: Meta<typeof StatTile> = {
  title: 'Components/StatTile',
  component: StatTile,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof StatTile>;

export const Default: Story = {
  args: { value: 7, label: 'Day streak' },
};

export const WithDelta: Story = {
  args: {
    value: 12,
    label: 'Reviewed today',
    delta: { value: 3, label: '3 more than yesterday' },
  },
};

export const Negative: Story = {
  args: {
    value: 1,
    label: 'Due',
    delta: { value: -2, label: '2 fewer than yesterday' },
  },
};

export const Unchanged: Story = {
  args: {
    value: 5,
    label: 'Day streak',
    delta: { value: 0, label: 'same as yesterday' },
  },
};

export const WithIcon: Story = {
  args: {
    value: 42,
    label: 'Cards mastered',
    icon: '🔥',
  },
};
