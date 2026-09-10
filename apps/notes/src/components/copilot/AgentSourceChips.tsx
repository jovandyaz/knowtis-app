import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { FileText } from 'lucide-react';

import type { AgentSource } from '@knowtis/api-client';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@knowtis/design-system';

export function AgentSourceChips({ sources }: { sources: AgentSource[] }) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('ai.copilot.sources')}
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {sources.map((source) => (
          <HoverCard key={source.id} openDelay={300}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  navigate({ to: ROUTES.NOTE, params: { noteId: source.id } })
                }
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary transition-colors motion-reduce:transition-none hover:bg-primary/20"
              >
                <FileText className="h-3 w-3" />
                <span className="max-w-32 truncate">{source.title}</span>
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-72" side="top">
              <p className="text-xs font-medium break-words">{source.title}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t('ai.copilot.openSource')}
              </p>
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
    </div>
  );
}
