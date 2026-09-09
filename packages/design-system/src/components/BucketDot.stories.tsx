import type { Meta, StoryObj } from '@storybook/react';

import { BUCKET_FILTERS } from '@knowtis/shared-types';

import { BucketDot, type BucketDotTone } from './BucketDot';

const TONES: readonly BucketDotTone[] = ['neutral', ...BUCKET_FILTERS];

const meta: Meta<typeof BucketDot> = {
  title: 'Components/BucketDot',
  component: BucketDot,
  tags: ['autodocs'],
  args: { bucket: 'projects' },
  argTypes: {
    bucket: { control: 'select', options: TONES },
  },
};

export default meta;
type Story = StoryObj<typeof BucketDot>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {TONES.map((tone) => (
        <span key={tone} className="flex items-center gap-2 text-xs">
          <BucketDot bucket={tone} />
          {tone}
        </span>
      ))}
    </div>
  ),
};
