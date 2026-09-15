import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './Button';
import { SegmentedProgress, type SegmentState } from './SegmentedProgress';

const meta: Meta<typeof SegmentedProgress> = {
  title: 'Components/SegmentedProgress',
  component: SegmentedProgress,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['track', 'hero'] },
    label: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-2xl bg-(--background) p-6 text-(--foreground)">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SegmentedProgress>;

export const Default: Story = {
  args: {
    segments: ['correct', 'current', 'pending'],
    label: '1 of 3 answered',
  },
};

export const AllStates: Story = {
  args: {
    segments: ['correct', 'wrong', 'skipped', 'current', 'pending'],
    label: '3 of 5 answered',
  },
};

export const Hero: Story = {
  args: {
    segments: ['correct', 'wrong', 'correct', 'skipped', 'correct'],
    label: '5 of 5 answered',
    size: 'hero',
  },
};

export const Perfect: Story = {
  args: {
    segments: ['correct', 'correct', 'correct'],
    label: '3 of 3 answered',
    size: 'hero',
  },
};

export const Empty: Story = {
  args: { segments: [], label: '0 of 0 answered' },
};

export const Dense: Story = {
  args: {
    segments: Array.from({ length: 100 }, (): SegmentState => 'pending'),
    label: '0 of 100 answered',
  },
};

function OutcomeDemo() {
  const [state, setState] = useState<SegmentState>('current');
  const answered = state === 'current' ? 1 : 2;

  return (
    <div className="space-y-6">
      <p className="font-mono text-xs text-(--muted-foreground)">
        {answered} of 3 answered
      </p>
      <SegmentedProgress
        segments={['correct', state, 'pending']}
        label={`${answered} of 3 answered`}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={state !== 'current'}
          onClick={() => setState('wrong')}
        >
          Not recalled
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={state !== 'current'}
          onClick={() => setState('correct')}
        >
          Recalled
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={state !== 'current'}
          onClick={() => setState('skipped')}
        >
          Skip card
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={state === 'current'}
          onClick={() => setState('current')}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

export const StateChanges: Story = { render: () => <OutcomeDemo /> };
