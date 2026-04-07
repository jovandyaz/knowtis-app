import { useMemo } from 'react';

import { useAIStore } from '@/stores/ai.store';
import type { CollaborativeUser } from '@/types';
import Collaboration from '@tiptap/extension-collaboration';
import type { AnyExtension } from '@tiptap/react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import { slashCommandsSuggestion } from './ai/SlashCommandMenu';
import { CollaborativeCursors } from './CollaborativeCursors';
import { createBaseExtensions } from './extensions/base-extensions';
import { GhostText } from './extensions/GhostText';

import './extensions/GhostText.css';

import { AIBlockNode } from './extensions/ai-block';
import { SlashCommands } from './extensions/SlashCommands';

export function useEditorExtensions(
  yDoc: Y.Doc,
  yXmlFragment: Y.XmlFragment,
  awareness: Awareness | null,
  currentUser: CollaborativeUser
): AnyExtension[] {
  return useMemo(() => {
    const extensions: AnyExtension[] = [
      ...createBaseExtensions({ undoRedo: false }),
      AIBlockNode,
      Collaboration.configure({
        document: yDoc,
        fragment: yXmlFragment,
      }),
      SlashCommands.configure({
        suggestion: slashCommandsSuggestion,
      }),
      GhostText.configure({
        debounceMs: 750,
        minContentLength: 20,
        enabled: true,
        isAIBusy: () => {
          const { aiEnabled, status } = useAIStore.getState();
          return !aiEnabled || status !== 'idle';
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
