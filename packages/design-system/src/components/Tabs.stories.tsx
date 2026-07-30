import type { Meta, StoryObj } from '@storybook/react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="models">
      <TabsList>
        <TabsTrigger value="models">Models</TabsTrigger>
        <TabsTrigger value="guardrails">Guardrails & Limits</TabsTrigger>
        <TabsTrigger value="providers">Providers</TabsTrigger>
      </TabsList>
      <TabsContent value="models">Models content</TabsContent>
      <TabsContent value="guardrails">Guardrails content</TabsContent>
      <TabsContent value="providers">Providers content</TabsContent>
    </Tabs>
  ),
};

export const Overflow: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The strip publishes its scroll state as `data-overflow` (`none`, `left`, `right`, `both`). The edge fade appears only while the strip can scroll further in that direction.',
      },
    },
  },
  render: () => (
    <div className="max-w-xs">
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General Configuration</TabsTrigger>
          <TabsTrigger value="models">Model Selection</TabsTrigger>
          <TabsTrigger value="guardrails">Guardrails & Limits</TabsTrigger>
          <TabsTrigger value="providers">Provider Failover</TabsTrigger>
          <TabsTrigger value="observability">
            Observability & Telemetry
          </TabsTrigger>
          <TabsTrigger value="billing">Billing & Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="general">General content</TabsContent>
        <TabsContent value="models">Models content</TabsContent>
        <TabsContent value="guardrails">Guardrails content</TabsContent>
        <TabsContent value="providers">Providers content</TabsContent>
        <TabsContent value="observability">Observability content</TabsContent>
        <TabsContent value="billing">Billing content</TabsContent>
      </Tabs>
    </div>
  ),
};
