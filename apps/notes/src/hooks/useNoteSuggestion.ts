import { useCallback, useEffect, useRef, useState } from 'react';

import { useSuggestOrganization } from '@knowtis/data-access-notes';
import {
  SUGGEST_IDLE_MS,
  SUGGEST_MIN_CONTENT_CHARS,
  type OrganizationSuggestion,
  type ParaBucket,
} from '@knowtis/shared-types';

const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * Session-scoped rather than component state: navigating away and back must not
 * earn a note a second automatic suggestion, and a dismissal has to stick.
 */
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
  /** Call on every local edit; the automatic suggestion fires once typing stops. */
  noteEdited: (contentHtml: string) => void;
}

export function useNoteSuggestion({
  noteId,
  bucket,
  isOwner,
  enabled,
}: NoteSuggestionParams): NoteSuggestionState {
  const { mutate, isPending, reset } = useSuggestOrganization();
  const [suggestion, setSuggestion] = useState<OrganizationSuggestion | null>(
    null
  );
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const request = useCallback(() => {
    mutate([noteId], {
      onSuccess: (results) => setSuggestion(results[0] ?? null),
    });
  }, [mutate, noteId]);

  const dismiss = useCallback(() => {
    dismissed.add(noteId);
    setSuggestion(null);
    reset();
  }, [noteId, reset]);

  // A CRDT editor fires no save event, so the automatic trigger is idleness:
  // every keystroke pushes the deadline out, and the card never lands mid-typing.
  const noteEdited = useCallback(
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
        request();
      }, SUGGEST_IDLE_MS);
    },
    [enabled, isOwner, bucket, noteId, request]
  );

  useEffect(
    () => () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
    },
    []
  );

  return { suggestion, isPending, request, dismiss, noteEdited };
}
