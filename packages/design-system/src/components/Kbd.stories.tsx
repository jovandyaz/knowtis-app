import type { Meta, StoryObj } from '@storybook/react';

import { Kbd } from './Kbd';

const meta: Meta<typeof Kbd> = {
  title: 'Components/Kbd',
  component: Kbd,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Kbd>;

export const Default: Story = { args: { children: 'Space' } };

export const Sequence: Story = {
  render: () => (
    <div className="flex items-center gap-1 text-sm text-(--muted-foreground)">
      <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd> rate ·{' '}
      <Kbd>Space</Kbd> flip
    </div>
  ),
};
