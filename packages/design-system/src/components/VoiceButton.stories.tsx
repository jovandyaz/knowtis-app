import type { Meta, StoryObj } from '@storybook/react';

import { VoiceButton } from './VoiceButton';

const meta: Meta<typeof VoiceButton> = {
  title: 'Components/VoiceButton',
  component: VoiceButton,
  tags: ['autodocs'],
  argTypes: {
    state: {
      control: 'select',
      options: ['idle', 'listening', 'paused', 'processing', 'disabled'],
    },
    emphasis: {
      control: 'select',
      options: ['solid', 'quiet'],
    },
    size: {
      control: 'select',
      options: ['sm', 'default', 'lg', 'xl'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof VoiceButton>;

export const Default: Story = {
  args: {
    state: 'idle',
  },
};

export const Listening: Story = {
  args: {
    state: 'listening',
  },
};

export const Paused: Story = {
  args: {
    state: 'paused',
  },
};

export const Processing: Story = {
  args: {
    state: 'processing',
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <VoiceButton state="idle" />
      <VoiceButton state="listening" />
      <VoiceButton state="paused" />
      <VoiceButton state="processing" />
      <VoiceButton state="disabled" />
    </div>
  ),
};

export const QuietIdle: Story = {
  args: {
    state: 'idle',
    emphasis: 'quiet',
    size: 'lg',
  },
};

export const EmphasisComparison: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <VoiceButton size="lg" emphasis="solid" />
      <VoiceButton size="lg" emphasis="quiet" />
      <VoiceButton size="lg" emphasis="quiet" state="listening" />
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <VoiceButton size="sm" />
      <VoiceButton size="default" />
      <VoiceButton size="lg" />
      <VoiceButton size="xl" />
    </div>
  ),
};
