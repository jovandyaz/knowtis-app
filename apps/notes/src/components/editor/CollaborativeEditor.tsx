import { useEffect } from 'react';

import {
  isWebSocketEnabled,
  useActiveCollaborators,
  useCollaborativeEditor,
  usePresenceBroadcast,
  useWebSocketCollaboration,
} from '@/hooks';
import { EditorContent, useEditor } from '@tiptap/react';

import { cn } from '@knowtis/design-system';
import { logger } from '@knowtis/shared-util';

import { CollaborationIndicator } from './CollaborationIndicator';

import './CollaborativeCursor.css';

import type {
  CollaborativeEditorProps,
  InternalEditorProps,
} from './CollaborativeEditor.types';
import { EditorErrorBoundary } from './EditorErrorBoundary';
import { EditorToolbar } from './EditorToolbar';
import { useEditorExtensions } from './useEditorExtensions';

const EDITOR_CONTAINER_CLASSES = cn(
  'rounded-2xl border border-border bg-card/50 backdrop-blur-sm',
  'transition-all duration-300',
  'focus-within:border-primary/50 focus-within:shadow-lg focus-within:shadow-primary/5'
);

function InternalEditor({
  yDoc,
  yXmlFragment,
  awareness,
  currentUser,
  initialContent,
  onUpdate,
  placeholder,
  editable,
}: InternalEditorProps) {
  const extensions = useEditorExtensions(
    yDoc,
    yXmlFragment,
    awareness,
    currentUser
  );

  const editor = useEditor({
    extensions,
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm sm:prose-base max-w-none',
          'min-h-[300px] p-6',
          'focus:outline-none',
          'prose-headings:text-foreground font-bold',
          'prose-p:text-foreground leading-relaxed',
          'prose-strong:text-foreground font-semibold',
          'prose-em:text-foreground italic',
          'prose-ul:text-foreground',
          'prose-ol:text-foreground',
          'prose-li:text-foreground marker:text-muted-foreground'
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor || !yXmlFragment || !initialContent) {
      return;
    }

    try {
      if (yXmlFragment.length === 0) {
        editor.commands.setContent(initialContent);
      }
    } catch (error) {
      logger.error('Error setting initial content', {
        error,
        context: 'CollaborativeEditor',
      });
    }
  }, [editor, yXmlFragment, initialContent]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return (
    <>
      <EditorToolbar editor={editor} />
      <div className={EDITOR_CONTAINER_CLASSES}>
        <EditorContent
          editor={editor}
          className={cn(
            '[&_.ProseMirror]:min-h-[300px]',
            '[&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
            '[&_.ProseMirror_p.is-editor-empty:first-child]:before:text-muted-foreground/50',
            '[&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left',
            '[&_.ProseMirror_p.is-editor-empty:first-child]:before:h-0',
            '[&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none'
          )}
          data-placeholder={placeholder}
        />
      </div>
    </>
  );
}

function EditorLoadingState() {
  return (
    <div
      className={cn(
        EDITOR_CONTAINER_CLASSES,
        'min-h-[350px] flex items-center justify-center'
      )}
    >
      <div className="text-muted-foreground">Loading editor...</div>
    </div>
  );
}

export function CollaborativeEditor({
  noteId,
  initialContent,
  onUpdate,
  placeholder = 'Start writing your note...',
  className,
  editable = true,
  shareToken,
  onEditDenied,
}: CollaborativeEditorProps) {
  const editorState = useCollaborativeEditor(noteId);
  const otherUsers = useActiveCollaborators(noteId);
  usePresenceBroadcast(noteId);

  const wsEnabled = isWebSocketEnabled();
  const { isConnected, remoteUsers } = useWebSocketCollaboration({
    noteId,
    yDoc: editorState.yDoc,
    currentUser: {
      name: editorState.currentUser.name,
      color: editorState.currentUser.color,
    },
    enabled: wsEnabled,
    shareToken,
    onEditDenied,
  });

  const allUsers = wsEnabled ? [...otherUsers, ...remoteUsers] : otherUsers;
  const uniqueUsers = allUsers.filter(
    (user, index, self) => index === self.findIndex((u) => u.name === user.name)
  );

  if (!editorState.isReady) {
    return (
      <div className={cn('relative', className)}>
        <EditorLoadingState />
      </div>
    );
  }

  return (
    <EditorErrorBoundary>
      <div className={cn('relative', className)}>
        {wsEnabled && (
          <div className="absolute top-2 right-2 z-10">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-emerald-500' : 'bg-amber-500'
              )}
              title={isConnected ? 'Connected to server' : 'Connecting...'}
            />
          </div>
        )}

        {uniqueUsers.length > 0 && (
          <CollaborationIndicator users={uniqueUsers} />
        )}

        <InternalEditor
          yDoc={editorState.yDoc}
          yXmlFragment={editorState.yXmlFragment}
          awareness={editorState.awareness}
          currentUser={editorState.currentUser}
          initialContent={initialContent}
          onUpdate={onUpdate}
          placeholder={placeholder}
          editable={editable}
        />
      </div>
    </EditorErrorBoundary>
  );
}
