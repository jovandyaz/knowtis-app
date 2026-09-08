import type { Meta, StoryObj } from '@storybook/react';

import { DonutChart } from './DonutChart';

const meta: Meta<typeof DonutChart> = {
  title: 'Components/DonutChart',
  component: DonutChart,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DonutChart>;

export const Default: Story = {
  args: {
    segments: [
      { value: 6, tone: 'correct', label: 'Got it' },
      { value: 3, tone: 'incorrect', label: 'Missed' },
      { value: 1, tone: 'muted', label: 'Skipped' },
    ],
    centerLabel: '60%',
    centerSublabel: '6 of 10',
    description: '60%, 6 of 10: got it 6, missed 3, skipped 1.',
  },
};

export const AllCorrect: Story = {
  args: {
    segments: [{ value: 10, tone: 'correct', label: 'Got it' }],
    centerLabel: '100%',
    centerSublabel: '10 of 10',
    description: '100%, 10 of 10: got it 10.',
  },
};

export const Empty: Story = {
  args: {
    segments: [{ value: 0, tone: 'correct', label: 'Got it' }],
    centerLabel: '0%',
    centerSublabel: '0 of 0',
    description: '0%, 0 of 0: nothing answered yet.',
  },
};

export const WithExtraLine: Story = {
  args: {
    segments: [
      { value: 6, tone: 'correct', label: 'Got it' },
      { value: 4, tone: 'incorrect', label: 'Missed' },
    ],
    centerLabel: '60%',
    centerSublabel: '6 of 10',
    description: '60%, 6 of 10: got it 6, missed 4. Took 4 minutes 20 seconds.',
    children: '4m 20s',
  },
};
