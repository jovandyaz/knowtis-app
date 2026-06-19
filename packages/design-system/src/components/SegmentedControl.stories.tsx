import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { BookOpen, Sparkles } from 'lucide-react';

import { SegmentedControl } from './SegmentedControl';

const meta: Meta<typeof SegmentedControl> = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
};
export default meta;

function SegmentedControlExample() {
  const [value, setValue] = useState('copilot');
  return (
    <SegmentedControl
      idBase="demo"
      ariaLabel="Modes"
      value={value}
      onValueChange={setValue}
      items={[
        { value: 'copilot', label: 'Copilot', icon: Sparkles },
        { value: 'study', label: 'Study', icon: BookOpen },
      ]}
    />
  );
}

export const Default: StoryObj<typeof SegmentedControl> = {
  render: () => <SegmentedControlExample />,
};
