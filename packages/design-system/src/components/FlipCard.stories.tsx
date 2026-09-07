import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { FlipCard } from './FlipCard';

const meta: Meta<typeof FlipCard> = {
  title: 'Components/FlipCard',
  component: FlipCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FlipCard>;

const FRONT = (
  <p className="text-lg font-medium">What is the capital of France?</p>
);
const BACK = <p className="text-lg font-medium">Paris</p>;

function InteractiveFlipCard() {
  const [flipped, setFlipped] = useState(false);
  return (
    <FlipCard
      front={FRONT}
      back={BACK}
      flipped={flipped}
      onFlip={() => setFlipped((current) => !current)}
      frontHint="Show answer"
      backHint="Show question"
    />
  );
}

export const Front: Story = {
  args: {
    front: FRONT,
    back: BACK,
    flipped: false,
    frontHint: 'Show answer',
    backHint: 'Show question',
    onFlip: fn(),
  },
};

export const Back: Story = {
  args: {
    front: FRONT,
    back: BACK,
    flipped: true,
    frontHint: 'Show answer',
    backHint: 'Show question',
    onFlip: fn(),
  },
};

export const Interactive: Story = {
  render: () => <InteractiveFlipCard />,
};
