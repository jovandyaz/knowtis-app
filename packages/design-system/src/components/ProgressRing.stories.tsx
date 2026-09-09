import type { Meta, StoryObj } from '@storybook/react';

import { ProgressRing } from './ProgressRing';

const meta: Meta<typeof ProgressRing> = {
  title: 'Components/ProgressRing',
  component: ProgressRing,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProgressRing>;

export const Default: Story = {
  args: { value: 4, max: 18, label: '4 of 18 cards' },
};

export const Complete: Story = {
  args: { value: 18, max: 18, label: '18 of 18 cards', tone: 'correct' },
};

export const WithLabel: Story = {
  args: {
    value: 4,
    max: 18,
    label: '4 of 18 cards',
    children: '4/18',
  },
};

export const Large: Story = {
  args: {
    value: 9,
    max: 18,
    label: '9 of 18 cards',
    size: 120,
    strokeWidth: 8,
    children: '50%',
  },
};
