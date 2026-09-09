import type { Meta, StoryObj } from '@storybook/react';

import { DECK_CHIP_TONES } from '../constants/deck-chip';
import { DeckChip } from './DeckChip';

const meta: Meta<typeof DeckChip> = {
  title: 'Components/DeckChip',
  component: DeckChip,
  tags: ['autodocs'],
  args: {
    title: 'The 80/20 rule',
    newLabel: 'New',
  },
};

export default meta;
type Story = StoryObj<typeof DeckChip>;

export const Default: Story = {};

export const New: Story = {
  args: { isNew: true },
};

export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      {DECK_CHIP_TONES.map((tone) => (
        <DeckChip
          key={tone}
          {...args}
          tone={tone}
          title={`${args.title} (${tone})`}
        />
      ))}
    </div>
  ),
};
