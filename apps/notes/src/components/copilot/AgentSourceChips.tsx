import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { FileText } from 'lucide-react';

import type { AgentSource } from '@knowtis/api-client';

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
          <button
            key={source.id}
            type="button"
            onClick={() =>
              navigate({ to: ROUTES.NOTE, params: { noteId: source.id } })
            }
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary transition-colors hover:bg-primary/20"
          >
            <FileText className="h-3 w-3" />
            <span className="max-w-32 truncate">{source.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
