import type { AwarenessState, CollaborativeCursorsOptions } from '@/types';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet, type Decoration } from '@tiptap/pm/view';
import { Extension } from '@tiptap/react';

import { logger } from '@knowtis/shared-util';

import { getRemoteUserStates } from './awareness.utils';
import { createUserDecorations } from './cursor-decorations.utils';

const PLUGIN_KEY = new PluginKey('collaborativeCursors');

const META_KEY = 'collaborativeCursors';

export const CollaborativeCursors =
  Extension.create<CollaborativeCursorsOptions>({
    name: 'collaborativeCursors',

    addOptions() {
      return {
        awareness:
          undefined as unknown as CollaborativeCursorsOptions['awareness'],
        user: { name: 'Anonymous', color: '#999999' },
      };
    },

    onCreate() {
      this.options.awareness.setLocalStateField('user', this.options.user);
    },

    onDestroy() {
      this.options.awareness.setLocalStateField('cursor', null);
    },

    addProseMirrorPlugins() {
      const { awareness } = this.options;
      const editor = this.editor;

      return [
        new Plugin({
          key: PLUGIN_KEY,

          state: {
            init: () => DecorationSet.empty,

            apply: (_tr, _decorationSet, _oldState, newState) => {
              const decorations: Decoration[] = [];
              const docSize = newState.doc.content.size;
              const remoteStates = getRemoteUserStates(
                awareness.getStates() as Map<number, AwarenessState>,
                awareness.clientID
              );

              for (const userState of remoteStates) {
                try {
                  decorations.push(
                    ...createUserDecorations(userState, docSize)
                  );
                } catch {
                  logger.warn('Failed to create user decorations', {
                    context: 'CollaborativeCursors',
                  });
                }
              }

              return DecorationSet.create(newState.doc, decorations);
            },
          },

          props: {
            decorations(state) {
              return PLUGIN_KEY.getState(state);
            },
          },

          view: () => {
            let isUpdating = false;

            const updateLocalCursor = () => {
              if (isUpdating) {
                return;
              }

              const { anchor, head } = editor.state.selection;
              awareness.setLocalStateField('cursor', { anchor, head });
            };

            const handleAwarenessUpdate = () => {
              if (isUpdating) {
                return;
              }

              isUpdating = true;

              requestAnimationFrame(() => {
                try {
                  const tr = editor.state.tr.setMeta(META_KEY, true);
                  editor.view.dispatch(tr);
                } catch {
                  logger.warn('Failed to update editor state', {
                    context: 'CollaborativeCursors',
                  });
                } finally {
                  isUpdating = false;
                }
              });
            };

            awareness.on('update', handleAwarenessUpdate);

            return {
              update: updateLocalCursor,
              destroy: () => {
                awareness.off('update', handleAwarenessUpdate);
              },
            };
          },
        }),
      ];
    },
  });
