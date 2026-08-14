import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { Globe, Lock } from 'lucide-react';

import { RadioCardGroup } from './RadioCardGroup';

const OPTIONS = [
  {
    value: 'restricted',
    title: 'Restricted',
    description: 'Only people with access can open the link.',
    icon: Lock,
  },
  {
    value: 'anyone_with_link',
    title: 'Anyone with the link',
    description: 'Anyone on the internet with the link can open it.',
    icon: Globe,
  },
] as const;

type Access = (typeof OPTIONS)[number]['value'];

const meta: Meta<typeof RadioCardGroup<Access>> = {
  title: 'Components/RadioCardGroup',
  component: RadioCardGroup,
};

export default meta;

function Controlled({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState<Access>('restricted');

  return (
    <div className="max-w-md">
      <RadioCardGroup
        aria-label="General access"
        options={OPTIONS}
        value={value}
        onValueChange={setValue}
        disabled={disabled ?? false}
      />
    </div>
  );
}

export const Default: StoryObj = { render: () => <Controlled /> };

export const Disabled: StoryObj = { render: () => <Controlled disabled /> };
