import { useMemo } from 'react';

import { useAIStore } from '@/stores/ai.store';
import Collaboration from '@tiptap/extension-collaboration';
import type { AnyExtension } from '@tiptap/react';
import i18next from 'i18next';
import { toast } from 'sonner';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import type { CollaborativeUser } from '@knowtis/crdt';
import {
  AIBlockNode,
  CollaborativeCursors,
  createBaseExtensions,
  GhostText,
  ImageNode,
  ImageUpload,
  SuggestionMenu,
} from '@knowtis/editor';
import { AI_ACTION } from '@knowtis/shared-types';
import { logger } from '@knowtis/shared-util';

import { createAiClientProvider } from './ai/aiClientProvider';
import { slashCommandsSuggestion } from './ai/SlashCommandMenu';
import { createImageUploadProvider } from './image/createImageUploadProvider';
import { createTagSuggestion } from './tags/tag-suggestion';

const ghostTextProvider = createAiClientProvider(AI_ACTION.GHOST_TEXT);
const aiBlockProvider = createAiClientProvider(AI_ACTION.LEARN_TOPIC);

export function useEditorExtensions(
  noteId: string,
  yDoc: Y.Doc,
  yXmlFragment: Y.XmlFragment,
  awareness: Awareness | null,
  currentUser: CollaborativeUser,
  canTag: boolean
): AnyExtension[] {
  return useMemo(() => {
    const imageUploadProvider = createImageUploadProvider(() => noteId);

    const extensions: AnyExtension[] = [
      ...createBaseExtensions({ disableHistory: true }),
      AIBlockNode.configure({
        provider: aiBlockProvider,
      }),
      ImageNode,
      ImageUpload.configure({
        provider: imageUploadProvider,
        onError: (error) => {
          logger.error('ImageUpload: provider failed', { error });
          toast.error(i18next.t('ai.image.uploadError', { ns: 'notes' }));
        },
      }),
      Collaboration.configure({
        document: yDoc,
        fragment: yXmlFragment,
      }),
      SuggestionMenu.extend({ name: 'slashCommands' }).configure({
        suggestion: slashCommandsSuggestion,
      }),
      GhostText.configure({
        provider: ghostTextProvider,
        debounceMs: 750,
        minContentLength: 20,
        enabled: true,
        isAIBusy: () => {
          const { aiEnabled, status } = useAIStore.getState();
          return !aiEnabled || status !== 'idle';
        },
        onError: (error) => {
          logger.error('GhostText: provider stream failed', { error });
        },
      }),
    ];

    if (canTag) {
      extensions.push(
        SuggestionMenu.extend({ name: 'tagSuggestions' }).configure({
          suggestion: createTagSuggestion(noteId),
        })
      );
    }

    if (awareness) {
      extensions.push(
        CollaborativeCursors.configure({
          awareness,
          user: {
            name: currentUser.name,
            color: currentUser.color,
          },
        })
      );
    }

    return extensions;
  }, [
    noteId,
    yDoc,
    yXmlFragment,
    awareness,
    currentUser.name,
    currentUser.color,
    canTag,
  ]);
}
