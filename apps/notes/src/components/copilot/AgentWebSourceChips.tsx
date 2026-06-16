import { useTranslation } from 'react-i18next';

import { ExternalLink } from 'lucide-react';

import type { WebSource } from '@knowtis/api-client';

export function AgentWebSourceChips({ sources }: { sources: WebSource[] }) {
  const { t } = useTranslation('notes');

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('ai.copilot.webSources')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary transition-colors hover:bg-primary/20"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="max-w-32 truncate">{source.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
