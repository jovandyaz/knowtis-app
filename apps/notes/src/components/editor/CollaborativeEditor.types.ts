import type { CollaborativeUser } from '@/types';
import type { Editor } from '@tiptap/react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

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
}

export interface InternalEditorProps {
  yDoc: Y.Doc;
  yXmlFragment: Y.XmlFragment;
  awareness: Awareness | null;
  currentUser: CollaborativeUser;
  initialContent: string;
  onUpdate: (content: string) => void;
  placeholder: string[];
  editable: boolean;

  autoFocus?: boolean | undefined;
  onEditorReady?: ((editor: Editor) => void) | undefined;
  onVoiceNote?: (() => void) | undefined;
}
