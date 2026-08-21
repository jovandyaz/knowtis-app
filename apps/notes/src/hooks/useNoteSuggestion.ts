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
const HTML_ENTITY_PATTERN = /&(?:[a-z]+|#\d+);/gi;

const autoRequested = new Set<string>();
const dismissed = new Set<string>();

function isActionable(
  suggestion: OrganizationSuggestion | undefined
): suggestion is OrganizationSuggestion {
  return (
    suggestion !== undefined &&
    (suggestion.bucket !== null ||
      suggestion.tags.length > 0 ||
      suggestion.relatedNotes.length > 0)
  );
}

function bodyLengthOf(contentHtml: string): number {
  return contentHtml
    .replace(HTML_TAG_PATTERN, '')
    .replace(HTML_ENTITY_PATTERN, ' ')
    .trim().length;
}

interface NoteSuggestionParams {
  noteId: string;
  bucket: ParaBucket | null;
  isOwner: boolean;
  enabled: boolean;
}

export interface NoteSuggestionState {
  suggestion: OrganizationSuggestion | null;
  isPending: boolean;
  request: (contentHtml: string) => void;
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
  const gate = useRef({ enabled, isOwner, bucket });
  useEffect(() => {
    gate.current = { enabled, isOwner, bucket };
  }, [enabled, isOwner, bucket]);

  const cancelIdlePass = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  const idlePassAllowed = useCallback(() => {
    const current = gate.current;
    return (
      current.enabled &&
      current.isOwner &&
      current.bucket === null &&
      !autoRequested.has(noteId) &&
      !dismissed.has(noteId)
    );
  }, [noteId]);

  const run = useCallback(
    (announce: boolean) =>
      mutate([noteId], {
        onSuccess: (results) => {
          const [first] = results;
          if (isActionable(first)) {
            setSuggestion(first);
            return;
          }
          setSuggestion(null);
          if (announce) {
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

  const request = useCallback(
    (contentHtml: string) => {
      cancelIdlePass();
      if (bodyLengthOf(contentHtml) < SUGGEST_MIN_CONTENT_CHARS) {
        toast(t('organization.suggestion.tooShort'));
        return;
      }
      autoRequested.add(noteId);
      run(true);
    },
    [cancelIdlePass, noteId, run, t]
  );

  const dismiss = useCallback(() => {
    cancelIdlePass();
    dismissed.add(noteId);
    setSuggestion(null);
    reset();
  }, [cancelIdlePass, noteId, reset]);

  const reportEdit = useCallback(
    (contentHtml: string) => {
      cancelIdlePass();

      if (
        !idlePassAllowed() ||
        bodyLengthOf(contentHtml) < SUGGEST_MIN_CONTENT_CHARS
      ) {
        return;
      }

      idleTimer.current = setTimeout(() => {
        idleTimer.current = null;
        if (!idlePassAllowed()) {
          return;
        }
        autoRequested.add(noteId);
        run(false);
      }, SUGGEST_IDLE_MS);
    },
    [cancelIdlePass, idlePassAllowed, noteId, run]
  );

  useEffect(() => cancelIdlePass, [cancelIdlePass]);

  return { suggestion, isPending, request, dismiss, reportEdit };
}
