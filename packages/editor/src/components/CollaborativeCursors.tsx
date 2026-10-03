import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { DecorationSet, type Decoration } from '@tiptap/pm/view';
import { Extension } from '@tiptap/react';
import type { Awareness } from 'y-protocols/awareness';

import {
  createUserDecorations,
  getRemoteUserStates,
  type AwarenessState,
} from '@knowtis/crdt';
import { logger } from '@knowtis/shared-util';

import './CollaborativeCursors.css';

interface CollaborativeCursorsState {
  awareness: Awareness | null;
  decorations: DecorationSet;
}

interface AwarenessChange {
  awareness: Awareness | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collaborativeCursors: {
      /** Follows `awareness` (a connection's presence), or none with `null`, without recreating the editor. */
      setCursorsAwareness: (awareness: Awareness | null) => ReturnType;
    };
  }
}

const PLUGIN_KEY = new PluginKey<CollaborativeCursorsState>(
  'collaborativeCursors'
);

const META_KEY = 'collaborativeCursors';

function remoteCursorDecorations(
  awareness: Awareness | null,
  state: EditorState
): DecorationSet {
  if (!awareness) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];
  const docSize = state.doc.content.size;
  const remoteStates = getRemoteUserStates(
    awareness.getStates() as Map<number, AwarenessState>,
    awareness.clientID
  );

  for (const userState of remoteStates) {
    try {
      decorations.push(...createUserDecorations(userState, docSize));
    } catch {
      logger.warn('Failed to create user decorations', {
        context: 'CollaborativeCursors',
      });
    }
  }

  return DecorationSet.create(state.doc, decorations);
}

export const CollaborativeCursors = Extension.create({
  name: 'collaborativeCursors',

  addCommands() {
    return {
      setCursorsAwareness:
        (awareness) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(PLUGIN_KEY, { awareness } satisfies AwarenessChange);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<CollaborativeCursorsState>({
        key: PLUGIN_KEY,

        state: {
          init: () => ({ awareness: null, decorations: DecorationSet.empty }),

          apply: (tr, previous, _oldState, newState) => {
            const change = tr.getMeta(PLUGIN_KEY) as
              | AwarenessChange
              | undefined;
            const awareness = change ? change.awareness : previous.awareness;
            return {
              awareness,
              decorations: remoteCursorDecorations(awareness, newState),
            };
          },
        },

        props: {
          decorations(state) {
            return PLUGIN_KEY.getState(state)?.decorations;
          },
        },

        view: (view) => {
          let followed: Awareness | null = null;
          let refreshPending = false;

          const refreshRemoteCursors = () => {
            if (refreshPending) {
              return;
            }

            refreshPending = true;

            requestAnimationFrame(() => {
              refreshPending = false;
              try {
                view.dispatch(view.state.tr.setMeta(META_KEY, true));
              } catch {
                logger.warn('Failed to update editor state', {
                  context: 'CollaborativeCursors',
                });
              }
            });
          };

          const publishLocalCursor = () => {
            const { anchor, head } = view.state.selection;
            followed?.setLocalStateField('cursor', { anchor, head });
          };

          const follow = (awareness: Awareness | null) => {
            followed?.off('update', refreshRemoteCursors);
            followed?.setLocalStateField('cursor', null);
            followed = awareness;
            followed?.on('update', refreshRemoteCursors);
          };

          return {
            update: (_view, previousState) => {
              const awareness =
                PLUGIN_KEY.getState(view.state)?.awareness ?? null;
              if (awareness !== followed) {
                follow(awareness);
                publishLocalCursor();
                return;
              }
              // Awareness emits `update` even for an unchanged state, so publishing
              // on the refresh our own publish schedules would loop every frame.
              if (!view.state.selection.eq(previousState.selection)) {
                publishLocalCursor();
              }
            },
            destroy: () => follow(null),
          };
        },
      }),
    ];
  },
});
