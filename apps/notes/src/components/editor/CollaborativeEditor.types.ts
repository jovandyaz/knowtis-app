import type { Editor } from '@tiptap/react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import type { CollaborativeUser } from '@knowtis/crdt';

export type DocumentConnectionState =
  | 'connecting'
  | 'syncing'
  | 'connected'
  | 'disconnected'
  | 'accessDenied';

export interface CollaborativeEditorProps {
  noteId: string;
  initialContent: string;
  onUpdate: (content: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  shareToken?: string | undefined;
  onEditDenied?: (() => void) | undefined;

  /** Owner-only: enables the inline `#` tag menu. Tags are the owner's
   *  classification, so a collaborator's `#` would only earn a 403. */
  canTag?: boolean | undefined;
  autoFocus?: boolean | undefined;
  onEditorReady?: ((editor: Editor) => void) | undefined;
  onVoiceNote?: (() => void) | undefined;
  /** When true, disables WebSocket collaboration and skips the provider init delay */
  localFirst?: boolean | undefined;
  /** Fires when live WS collaboration becomes (or stops being) the source of
   *  truth — connected AND synced. The page uses it to suppress the redundant
   *  REST content autosave that otherwise echoes back and resets the caret. */
  onLiveCollaborationChange?: ((isLive: boolean) => void) | undefined;
  /** Fires on every change of the collaboration session's state, and with
   *  `null` while WS collaboration is off — the note header owns the display. */
  onConnectionStateChange?:
    | ((state: DocumentConnectionState | null) => void)
    | undefined;
}

export interface InternalEditorProps {
  noteId: string;
  yDoc: Y.Doc;
  yXmlFragment: Y.XmlFragment;
  awareness: Awareness | null;
  currentUser: CollaborativeUser;
  initialContent: string;
  onUpdate: (content: string) => void;
  placeholder: string[];
  editable: boolean;
  isSynced: boolean;
  canTag: boolean;
  canImportImages: boolean;

  autoFocus?: boolean | undefined;
  onEditorReady?: ((editor: Editor) => void) | undefined;
  onVoiceNote?: (() => void) | undefined;
}
