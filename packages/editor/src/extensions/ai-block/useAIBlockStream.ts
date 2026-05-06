import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Editor } from '@tiptap/core';

import {
  AI_BLOCK_STATUS,
  type AIBlockAttributes,
  type AIBlockProvider,
  type AIBlockStorage,
} from './AIBlockNode';

interface UseAIBlockStreamReturn {
  streamedText: string;
  start: (topic: string) => void;
  cancel: () => void;
  retry: (currentTopic: string) => void;
}

function resolveProvider(editor: Editor): AIBlockProvider | null {
  const storage = (editor.storage as { aiBlock?: AIBlockStorage }).aiBlock;
  return storage?.provider ?? null;
}

/**
 * Owns the lifecycle of an AIBlock provider stream:
 *  - Single source of truth for cancellation: `AbortController`.
 *    There is no separate `cancelledRef` — late chunks check
 *    `controller.signal.aborted` (and that the stored controller is still
 *    this one) directly.
 *  - Aborts in-flight requests on unmount.
 *  - Surfaces streaming text as React state for the streaming UI.
 *  - Writes terminal status (DONE / ERROR) back to the node attrs.
 */
export function useAIBlockStream(
  editor: Editor,
  updateAttributes: (attrs: Partial<AIBlockAttributes>) => void
): UseAIBlockStreamReturn {
  const { t } = useTranslation('notes');
  const [streamedText, setStreamedText] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    (topic: string) => {
      const provider = resolveProvider(editor);
      if (!provider) {
        updateAttributes({
          status: AI_BLOCK_STATUS.ERROR,
          errorMessage: t('ai.aiBlock.errorGeneric'),
        });
        return;
      }

      setStreamedText('');
      updateAttributes({ status: AI_BLOCK_STATUS.STREAMING, topic });

      // Cancel any prior in-flight stream owned by this hook.
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const accumulated: string[] = [];

      void (async () => {
        try {
          for await (const chunk of provider.stream({
            content: topic,
            signal: controller.signal,
          })) {
            // Guard BEFORE mutating state: a late chunk that races with abort
            // (or with a newer stream replacing this controller) must not
            // overwrite the view's `streamedText`.
            if (
              abortControllerRef.current !== controller ||
              controller.signal.aborted
            ) {
              return;
            }
            accumulated.push(chunk.text);
            setStreamedText(accumulated.join(''));
          }

          if (controller.signal.aborted) {
            return;
          }

          updateAttributes({
            status: AI_BLOCK_STATUS.DONE,
            content: accumulated.join(''),
          });
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }
          const message =
            error instanceof Error
              ? error.message
              : t('ai.aiBlock.errorGeneric');
          updateAttributes({
            status: AI_BLOCK_STATUS.ERROR,
            errorMessage: message,
          });
        } finally {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
        }
      })();
    },
    [editor, updateAttributes, t]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    updateAttributes({ status: AI_BLOCK_STATUS.INPUT });
  }, [updateAttributes]);

  const retry = useCallback(
    (currentTopic: string) => {
      start(currentTopic);
    },
    [start]
  );

  return { streamedText, start, cancel, retry };
}
