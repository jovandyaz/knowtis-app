import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { useSuggestOrganization } from '@knowtis/data-access-notes';
import {
  SUGGEST_IDLE_MS,
  SUGGEST_MIN_CONTENT_CHARS,
  type OrganizationSuggestion,
  type ParaBucket,
} from '@knowtis/shared-types';

const HTML_TAG_PATTERN = /<[^>]*>/g;

const autoRequested = new Set<string>();
const dismissed = new Set<string>();

interface NoteSuggestionParams {
  noteId: string;
  bucket: ParaBucket | null;
  isOwner: boolean;
  enabled: boolean;
}

export interface NoteSuggestionState {
  suggestion: OrganizationSuggestion | null;
  isPending: boolean;
  request: () => void;
  dismiss: () => void;
  reportEdit: (contentHtml: string) => void;
}

export function useNoteSuggestion({
  noteId,
  bucket,
  isOwner,
  enabled,
}: NoteSuggestionParams): NoteSuggestionState {
  const { t } = useTranslation('notes');
  const { mutate, isPending, reset } = useSuggestOrganization();
  const [suggestion, setSuggestion] = useState<OrganizationSuggestion | null>(
    null
  );
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The idle pass is unsolicited, so it stays quiet; only an ask the author
  // made reports back when there is nothing to show or the call fails.
  const run = useCallback(
    (announce: boolean) =>
      mutate([noteId], {
        onSuccess: (results) => {
          const [first] = results;
          setSuggestion(first ?? null);
          if (!first && announce) {
            toast(t('organization.suggestion.empty'));
          }
        },
        ...(announce
          ? {
              onError: () => toast.error(t('organization.suggestion.failed')),
            }
          : {}),
      }),
    [mutate, noteId, t]
  );

  const request = useCallback(() => run(true), [run]);

  const dismiss = useCallback(() => {
    dismissed.add(noteId);
    setSuggestion(null);
    reset();
  }, [noteId, reset]);

  const reportEdit = useCallback(
    (contentHtml: string) => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }

      const isInbox = bucket === null;
      const bodyLength = contentHtml
        .replace(HTML_TAG_PATTERN, '')
        .trim().length;

      if (
        !enabled ||
        !isOwner ||
        !isInbox ||
        bodyLength < SUGGEST_MIN_CONTENT_CHARS ||
        autoRequested.has(noteId) ||
        dismissed.has(noteId)
      ) {
        return;
      }

      idleTimer.current = setTimeout(() => {
        autoRequested.add(noteId);
        run(false);
      }, SUGGEST_IDLE_MS);
    },
    [enabled, isOwner, bucket, noteId, run]
  );

  useEffect(
    () => () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
    },
    []
  );

  return { suggestion, isPending, request, dismiss, reportEdit };
}
