import type { Meta, StoryObj } from '@storybook/react';

import { DocumentSkeleton } from './DocumentSkeleton';

const meta: Meta<typeof DocumentSkeleton> = {
  title: 'Components/DocumentSkeleton',
  component: DocumentSkeleton,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DocumentSkeleton>;

export const Default: Story = {
  args: { label: 'Loading document' },
  render: (args) => (
    <div className="w-[520px]">
      <DocumentSkeleton {...args} />
    </div>
  ),
};

export const WithoutTitle: Story = {
  args: { label: 'Loading document', showTitle: false, lines: 8 },
  render: (args) => (
    <div className="w-[520px]">
      <DocumentSkeleton {...args} />
    </div>
  ),
};
