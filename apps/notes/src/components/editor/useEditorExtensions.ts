import { useMemo } from 'react';

import { useAIStore } from '@/stores/ai.store';
import type { CollaborativeUser } from '@/types';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Collaboration from '@tiptap/extension-collaboration';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { AnyExtension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import { slashCommandsSuggestion } from './ai/SlashCommandMenu';
import { CollaborativeCursors } from './CollaborativeCursors';
import { CodeBlockView } from './extensions/code-block/CodeBlockView';
import { lowlight } from './extensions/code-block/lowlight-instance';
import { GhostText } from './extensions/GhostText';

import './extensions/GhostText.css';

import { SlashCommands } from './extensions/SlashCommands';

export function useEditorExtensions(
  yDoc: Y.Doc,
  yXmlFragment: Y.XmlFragment,
  awareness: Awareness | null,
  currentUser: CollaborativeUser
): AnyExtension[] {
  return useMemo(() => {
    const extensions: AnyExtension[] = [
      StarterKit.configure({
        codeBlock: false,
        undoRedo: false,
        bulletList: {
          HTMLAttributes: { class: 'list-disc list-outside ml-6' },
        },
        orderedList: {
          HTMLAttributes: { class: 'list-decimal list-outside ml-6' },
        },
        listItem: {
          HTMLAttributes: { class: 'leading-normal' },
        },
        blockquote: {
          HTMLAttributes: {
            class:
              'border-l-2 border-muted-foreground/40 pl-4 italic text-muted-foreground',
          },
        },
        heading: {
          levels: [1, 2, 3],
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: null,
      }).extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Underline,
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
