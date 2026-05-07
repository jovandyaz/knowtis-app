import { useMemo } from 'react';

import { useAIStore } from '@/stores/ai.store';
import Collaboration from '@tiptap/extension-collaboration';
import type { AnyExtension } from '@tiptap/react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import type { CollaborativeUser } from '@knowtis/crdt';
import {
  AIBlockNode,
  CollaborativeCursors,
  createBaseExtensions,
  GhostText,
  SlashCommands,
} from '@knowtis/editor';
import { AI_ACTION } from '@knowtis/shared-types';
import { logger } from '@knowtis/shared-util';

import { createAiClientProvider } from './ai/aiClientProvider';
import { slashCommandsSuggestion } from './ai/SlashCommandMenu';

const ghostTextProvider = createAiClientProvider(AI_ACTION.GHOST_TEXT);
const aiBlockProvider = createAiClientProvider(AI_ACTION.LEARN_TOPIC);

export function useEditorExtensions(
  yDoc: Y.Doc,
  yXmlFragment: Y.XmlFragment,
  awareness: Awareness | null,
  currentUser: CollaborativeUser
): AnyExtension[] {
  return useMemo(() => {
    const extensions: AnyExtension[] = [
      ...createBaseExtensions({ disableHistory: true }),
      AIBlockNode.configure({
        provider: aiBlockProvider,
      }),
      Collaboration.configure({
        document: yDoc,
        fragment: yXmlFragment,
      }),
      SlashCommands.configure({
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
  }, [yDoc, yXmlFragment, awareness, currentUser.name, currentUser.color]);
}
