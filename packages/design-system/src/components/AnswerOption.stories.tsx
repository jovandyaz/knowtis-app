import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { AnswerOption } from './AnswerOption';

const meta: Meta<typeof AnswerOption> = {
  title: 'Components/AnswerOption',
  component: AnswerOption,
  tags: ['autodocs'],
  args: {
    index: 0,
    children: 'Paris',
    onSelect: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AnswerOption>;

export const Idle: Story = {};

export const Selected: Story = {
  args: { selected: true },
};

export const Correct: Story = {
  args: { selected: true, outcome: 'correct' },
};

export const Incorrect: Story = {
  args: { index: 1, children: 'Lyon', selected: true, outcome: 'incorrect' },
};

export const RevealedCorrect: Story = {
  args: { outcome: 'correct' },
};

export const Disabled: Story = {
  args: { disabled: true },
};
