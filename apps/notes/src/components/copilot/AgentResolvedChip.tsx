import { useTranslation } from 'react-i18next';

import { Check, X } from 'lucide-react';

import { cn } from '@knowtis/design-system';

interface AgentResolvedChipProps {
  committed?:
    | { kind: 'create' | 'update' | 'share'; title: string }
    | undefined;
  discarded?: boolean | undefined;
}

export function AgentResolvedChip({
  committed,
  discarded,
}: AgentResolvedChipProps) {
  const { t } = useTranslation('notes');

  if (committed) {
    return (
      <span
        className={cn(
          'inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
          'bg-primary/10 text-primary'
        )}
      >
        <Check className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {t(`ai.copilot.proposal.committed.${committed.kind}`, {
            title: committed.title,
          })}
        </span>
      </span>
    );
  }

  if (discarded) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
        <X className="h-3.5 w-3.5 shrink-0" />
        {t('ai.copilot.proposal.discarded')}
      </span>
    );
  }

  return null;
}
