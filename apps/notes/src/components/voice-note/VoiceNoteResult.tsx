import { useTranslation } from 'react-i18next';

import DOMPurify from 'dompurify';
import { FileText, RefreshCw, Trash2 } from 'lucide-react';

import { Button } from '@knowtis/design-system';

interface VoiceNoteResultProps {
  title: string;
  content: string;
  onCreateNote: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  actionLabel?: string;
}

export function VoiceNoteResult({
  title,
  content,
  onCreateNote,
  onRetry,
  onDiscard,
  actionLabel,
}: VoiceNoteResultProps) {
  const { t } = useTranslation('notes');
  const resolvedActionLabel = actionLabel ?? t('ai.voice.createNote');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold text-(--foreground) leading-tight">
          {title}
        </h3>
      </div>

      <div
        className="prose prose-sm dark:prose-invert max-h-48 overflow-y-auto rounded-lg border border-(--border)/50 bg-(--muted)/30 p-3"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard} className="gap-1">
          <Trash2 className="h-4 w-4" />
          {t('ai.voice.discard')}
        </Button>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1">
          <RefreshCw className="h-4 w-4" />
          {t('ai.voice.retry')}
        </Button>
        <Button size="sm" onClick={onCreateNote} className="gap-1">
          <FileText className="h-4 w-4" />
          {resolvedActionLabel}
        </Button>
      </div>
    </div>
  );
}
