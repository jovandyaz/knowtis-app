import type { Meta, StoryObj } from '@storybook/react';

import { OutcomeStamp } from './OutcomeStamp';

const meta: Meta<typeof OutcomeStamp> = {
  title: 'Components/OutcomeStamp',
  component: OutcomeStamp,
  tags: ['autodocs'],
  argTypes: {
    verdict: {
      control: 'inline-radio',
      options: ['correct', 'wrong', 'skipped'],
    },
    label: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <div className="relative w-full max-w-2xl rounded-xl border border-(--border) bg-(--card) p-6 text-(--card-foreground)">
        <p className="pr-12 font-mono text-xs text-(--muted-foreground)">
          Answer
        </p>
        <p className="my-8 font-serif text-2xl leading-relaxed">
          They take place in the thylakoid membranes inside chloroplasts.
        </p>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof OutcomeStamp>;

export const Correct: Story = {
  args: { verdict: 'correct', label: 'Recalled' },
};
export const Wrong: Story = {
  args: { verdict: 'wrong', label: 'Needs practice' },
};
export const Skipped: Story = {
  args: { verdict: 'skipped', label: 'Skipped' },
};
