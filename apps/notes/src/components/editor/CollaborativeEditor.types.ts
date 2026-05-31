import type { Editor } from '@tiptap/react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import type { CollaborativeUser } from '@knowtis/crdt';

export interface CollaborativeEditorProps {
  noteId: string;
  initialContent: string;
  onUpdate: (content: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  shareToken?: string | undefined;
  onEditDenied?: (() => void) | undefined;

  autoFocus?: boolean | undefined;
  onEditorReady?: ((editor: Editor) => void) | undefined;
  onVoiceNote?: (() => void) | undefined;
  /** When true, disables WebSocket collaboration and skips the provider init delay */
  localFirst?: boolean | undefined;
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

  autoFocus?: boolean | undefined;
  onEditorReady?: ((editor: Editor) => void) | undefined;
  onVoiceNote?: (() => void) | undefined;
}
