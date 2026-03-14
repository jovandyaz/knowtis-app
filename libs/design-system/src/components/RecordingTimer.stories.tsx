import type { Meta, StoryObj } from '@storybook/react';

import { RecordingTimer } from './RecordingTimer';

const meta: Meta<typeof RecordingTimer> = {
  title: 'Components/RecordingTimer',
  component: RecordingTimer,
  tags: ['autodocs'],
  argTypes: {
    elapsed: {
      control: { type: 'number', min: 0, max: 600, step: 1 },
    },
    maxDuration: {
      control: { type: 'number', min: 30, max: 600, step: 30 },
    },
    isRecording: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof RecordingTimer>;

export const Default: Story = {
  args: {
    elapsed: 45,
    maxDuration: 300,
    isRecording: true,
  },
};

export const NearLimit: Story = {
  args: {
    elapsed: 275,
    maxDuration: 300,
    isRecording: true,
  },
};

export const Paused: Story = {
  args: {
    elapsed: 120,
    maxDuration: 300,
    isRecording: false,
  },
};
