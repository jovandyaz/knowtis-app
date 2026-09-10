import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Switch } from './Switch';

const meta: Meta<typeof Switch> = {
  title: 'Components/Switch',
  component: Switch,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Switch>;

function Controlled({
  size = 'default',
  disabled = false,
  initial = false,
}: {
  size?: 'default' | 'sm';
  disabled?: boolean;
  initial?: boolean;
}) {
  const [checked, setChecked] = useState(initial);
  return (
    <Switch
      checked={checked}
      onCheckedChange={setChecked}
      size={size}
      disabled={disabled}
      aria-label="Email notifications"
    />
  );
}

export const Default: Story = {
  render: () => <Controlled />,
};

export const Checked: Story = {
  render: () => <Controlled initial />,
};

export const Small: Story = {
  render: () => <Controlled size="sm" initial />,
};

export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Controlled disabled />
      <Controlled disabled initial />
    </div>
  ),
};

function InFormSwitch() {
  const [checked, setChecked] = useState(true);
  return (
    <Switch
      checked={checked}
      onCheckedChange={setChecked}
      name="notifications"
      value="on"
      aria-label="Email notifications"
    />
  );
}

export const InAForm: Story = {
  render: () => (
    <form className="flex items-center gap-2">
      <InFormSwitch />
      <span className="text-sm">
        submits a hidden checkbox as name=&quot;notifications&quot;
      </span>
    </form>
  ),
};
