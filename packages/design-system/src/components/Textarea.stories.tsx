import type { Meta, StoryObj } from '@storybook/react';

import { Textarea } from './Textarea';

const meta: Meta<typeof Textarea> = {
  title: 'Components/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  argTypes: {
    disabled: {
      control: 'boolean',
    },
    placeholder: {
      control: 'text',
    },
    rows: {
      control: 'number',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    placeholder: 'Enter your message...',
  },
};

export const WithValue: Story = {
  args: {
    defaultValue:
      'This is a pre-filled textarea with some content that spans multiple lines to demonstrate how the component handles larger amounts of text.',
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled textarea',
    disabled: true,
  },
};

export const WithRows: Story = {
  args: {
    placeholder: 'Larger textarea...',
    rows: 8,
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="space-y-2">
      <label htmlFor="message" className="text-sm font-medium">
        Message
      </label>
      <Textarea id="message" placeholder="Type your message here..." />
      <p className="text-sm text-muted-foreground">
        Your message will be reviewed by our team.
      </p>
    </div>
  ),
};
