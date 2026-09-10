import type { Meta, StoryObj } from '@storybook/react';
import { ExternalLink } from 'lucide-react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';

const meta: Meta<typeof HoverCard> = {
  title: 'Components/HoverCard',
  component: HoverCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HoverCard>;

export const Default: Story = {
  render: () => (
    <div className="p-24">
      <HoverCard openDelay={300}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-(--primary)/40 bg-(--primary)/10 px-2 py-0.5 text-[10px] text-(--primary)"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="max-w-32 truncate">
              Quarterly release checklist
            </span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="w-72" side="top">
          <p className="text-xs font-medium break-words">
            Quarterly release checklist
          </p>
          <p className="mt-1 text-[10px] break-all text-(--muted-foreground)">
            https://example.com/docs/release-checklist
          </p>
        </HoverCardContent>
      </HoverCard>
    </div>
  ),
};

export const AlwaysOpen: Story = {
  render: () => (
    <div className="p-24">
      <HoverCard open>
        <HoverCardTrigger asChild>
          <button type="button" className="cursor-pointer text-xs underline">
            Sprint retro
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="w-72" side="top">
          <p className="text-xs font-medium">Sprint retro</p>
          <p className="mt-1 text-[10px] text-(--muted-foreground)">
            Open note
          </p>
        </HoverCardContent>
      </HoverCard>
    </div>
  ),
};
