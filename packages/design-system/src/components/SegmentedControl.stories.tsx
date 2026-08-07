import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'fast', label: 'Fast', title: 'Instant answers' },
  { value: 'balanced', label: 'Balanced', title: 'The sweet spot' },
  { value: 'powerful', label: 'Deep', title: 'Deep reasoning' },
] as const;

const meta: Meta<typeof SegmentedControl> = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
};
export default meta;

type Story = StoryObj<typeof SegmentedControl>;

function Controlled({ initial }: { initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <SegmentedControl
      aria-label="Assistant style"
      options={OPTIONS}
      value={value}
      onValueChange={setValue}
    />
  );
}

export const Default: Story = {
  render: () => <Controlled initial="balanced" />,
};

export const NoneActive: Story = {
  render: () => <Controlled initial={null} />,
};

export const Disabled: Story = {
  render: () => (
    <SegmentedControl
      aria-label="Assistant style"
      options={OPTIONS}
      value="balanced"
      onValueChange={() => undefined}
      disabled
    />
  ),
};
