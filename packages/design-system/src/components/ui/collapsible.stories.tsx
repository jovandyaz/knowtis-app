import type { Meta, StoryObj } from '@storybook/react';
import { ChevronDown } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './collapsible';

const meta: Meta<typeof Collapsible> = {
  title: 'Components/Collapsible',
  component: Collapsible,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Collapsible>;

export const Default: Story = {
  render: () => (
    <Collapsible className="w-80">
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 text-xs text-(--muted-foreground) hover:text-(--foreground)">
        Thinking…
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 max-h-32 overflow-y-auto text-xs text-(--muted-foreground)">
        Scanning the workspace for notes that mention the release checklist,
        then ranking them by recency before drafting the summary.
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const OpenByDefault: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-80">
      <CollapsibleTrigger className="cursor-pointer text-xs text-(--muted-foreground)">
        Sources considered
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 text-xs text-(--muted-foreground)">
        Release checklist · Sprint retro · Incident 402
      </CollapsibleContent>
    </Collapsible>
  ),
};
