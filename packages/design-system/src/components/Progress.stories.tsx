import type { Meta, StoryObj } from '@storybook/react';

import { Progress } from './Progress';

const meta: Meta<typeof Progress> = {
  title: 'Components/Progress',
  component: Progress,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  args: { value: 30, max: 100, label: '30 of 100 questions' },
};

export const Correct: Story = {
  args: { value: 7, max: 10, label: '7 of 10 correct', tone: 'correct' },
};

export const Incorrect: Story = {
  args: { value: 3, max: 10, label: '3 of 10 incorrect', tone: 'incorrect' },
};

export const Danger: Story = {
  args: { value: 9, max: 10, label: '9 of 10 seconds used', tone: 'danger' },
};

export const Empty: Story = {
  args: { value: 0, max: 10, label: '0 of 10 questions' },
};

export const Complete: Story = {
  args: { value: 10, max: 10, label: '10 of 10 questions' },
};
