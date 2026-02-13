import type { CollaborativeUser } from '@/types';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

/**
 * Props for the CollaborativeEditor component
 * @param noteId - The ID of the note
 * @param initialContent - The initial content of the editor
 * @param onUpdate - Function to update the content of the editor
 * @param placeholder - The placeholder text for the editor
 * @param className - The class name for the editor container
 * @param editable - Whether the editor is editable
 */
export interface CollaborativeEditorProps {
  noteId: string;
  initialContent: string;
  onUpdate: (content: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  shareToken?: string | undefined;
  onEditDenied?: (() => void) | undefined;
}

/**
 * Props for the InternalEditor component
 * @param yDoc - The Yjs document instance
 * @param yXmlFragment - The Yjs XML fragment for storing editor content
 * @param awareness - The Awareness instance for cursor tracking
 * @param currentUser - The current user information
 * @param initialContent - The initial content of the editor
 * @param onUpdate - Function to update the content of the editor
 * @param placeholder - The placeholder text for the editor
 * @param editable - Whether the editor is editable
 */
export interface InternalEditorProps {
  yDoc: Y.Doc;
  yXmlFragment: Y.XmlFragment;
  awareness: Awareness | null;
  currentUser: CollaborativeUser;
  initialContent: string;
  onUpdate: (content: string) => void;
  placeholder: string;
  editable: boolean;
}
