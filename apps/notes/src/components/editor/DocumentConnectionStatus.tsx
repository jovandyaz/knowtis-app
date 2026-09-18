import { useTranslation } from 'react-i18next';

import { cn } from '@knowtis/design-system';

import type { DocumentConnectionState } from './CollaborativeEditor.types';

const DOT_CLASSES: Record<DocumentConnectionState, string> = {
  connecting: 'bg-(--warning)',
  syncing: 'bg-(--warning)',
  connected: 'bg-(--success)',
  disconnected: 'bg-(--destructive)',
  accessDenied: 'bg-(--destructive)',
};

interface DocumentConnectionStatusProps {
  state: DocumentConnectionState | null;
  compactLabel?: boolean;
}

export function DocumentConnectionStatus({
  state,
  compactLabel = false,
}: DocumentConnectionStatusProps) {
  const { t } = useTranslation('notes');

  if (state === null) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
    >
      <span
        aria-hidden
        className={cn('size-2 shrink-0 rounded-full', DOT_CLASSES[state])}
      />
      <span className={compactLabel ? 'max-sm:sr-only' : undefined}>
        {t(`editor.connection.${state}`)}
      </span>
    </div>
  );
}
