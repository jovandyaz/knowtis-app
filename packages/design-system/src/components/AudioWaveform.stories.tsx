import type { Meta, StoryObj } from '@storybook/react';

import { AudioWaveform } from './AudioWaveform';

const meta: Meta<typeof AudioWaveform> = {
  title: 'Components/AudioWaveform',
  component: AudioWaveform,
  tags: ['autodocs'],
  argTypes: {
    barCount: {
      control: { type: 'number', min: 10, max: 80, step: 5 },
    },
    barGap: {
      control: { type: 'number', min: 1, max: 6, step: 1 },
    },
    barColor: { control: 'color' },
    barActiveColor: { control: 'color' },
  },
};

export default meta;
type Story = StoryObj<typeof AudioWaveform>;

function generateMockData(barCount: number, intensity: number): Uint8Array {
  const data = new Uint8Array(barCount * 4);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(Math.random() * 255 * intensity);
  }
  return data;
}

export const Idle: Story = {
  args: {
    barCount: 40,
    barGap: 2,
  },
};

export const WithMockData: Story = {
  args: {
    mockData: generateMockData(40, 0.7),
    barCount: 40,
    barGap: 2,
  },
};

export const HighActivity: Story = {
  args: {
    mockData: generateMockData(40, 1),
    barCount: 40,
    barGap: 2,
  },
};

export const LowActivity: Story = {
  args: {
    mockData: generateMockData(40, 0.2),
    barCount: 40,
    barGap: 2,
  },
};

export const DenseBars: Story = {
  args: {
    mockData: generateMockData(60, 0.6),
    barCount: 60,
    barGap: 1,
  },
};

export const SparseBars: Story = {
  args: {
    mockData: generateMockData(20, 0.8),
    barCount: 20,
    barGap: 4,
  },
};
