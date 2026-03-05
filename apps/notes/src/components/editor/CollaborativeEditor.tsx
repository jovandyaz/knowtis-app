import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  isWebSocketEnabled,
  useActiveCollaborators,
  useCollaborativeEditor,
  usePresenceBroadcast,
  useWebSocketCollaboration,
} from '@/hooks';
import { EditorContent, useEditor } from '@tiptap/react';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { cn } from '@knowtis/design-system';
import { logger } from '@knowtis/shared-util';

import { AIBubbleMenu } from './ai/AIBubbleMenu';
import { AIResultPanel } from './ai/AIResultPanel';
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
  saveStatus,
}: InternalEditorProps) {
  const aiEnabled = useFeatureFlag('ai_enabled');
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const extensions = useEditorExtensions(
    yDoc,
    yXmlFragment,
    awareness,
    currentUser,
    aiEnabled
  );

  const editor = useEditor({
    extensions,
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm sm:prose-base max-w-none',
          'min-h-[300px] p-4 md:p-6',
          'focus:outline-none',
          'prose-headings:text-foreground prose-headings:font-bold',
          'prose-p:text-foreground leading-relaxed',
          'prose-strong:text-foreground font-semibold',
          'prose-em:text-foreground',
          'prose-ul:text-foreground',
          'prose-ol:text-foreground',
          'prose-li:text-foreground marker:text-muted-foreground'
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      queueMicrotask(() => onUpdateRef.current(html));
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
      <EditorToolbar editor={editor} saveStatus={saveStatus} />
      <div className={EDITOR_CONTAINER_CLASSES}>
        {editor && aiEnabled && (
          <>
            <AIBubbleMenu editor={editor} />
            <AIResultPanel editor={editor} />
          </>
        )}
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

      <div className="h-16 md:hidden" />
    </>
  );
}

function EditorLoadingState() {
  const { t } = useTranslation('notes');

  return (
    <div
      className={cn(
        EDITOR_CONTAINER_CLASSES,
        'min-h-[350px] flex items-center justify-center'
      )}
    >
      <div className="text-muted-foreground">{t('editor.loadingEditor')}</div>
    </div>
  );
}

export function CollaborativeEditor({
  noteId,
  initialContent,
  onUpdate,
  placeholder,
  className,
  editable = true,
  shareToken,
  onEditDenied,
  saveStatus,
}: CollaborativeEditorProps) {
  const { t } = useTranslation('notes');
  const editorState = useCollaborativeEditor(noteId);
  const otherUsers = useActiveCollaborators(noteId);
  usePresenceBroadcast(noteId);
  const resolvedPlaceholder: string =
    placeholder ?? t('editor.editorPlaceholder');

  const wsEnabled = isWebSocketEnabled();
  const { isConnected, isSynced, remoteUsers } = useWebSocketCollaboration({
    noteId,
    yDoc: editorState.yDoc,
    awareness: editorState.awareness,
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
              title={
                isConnected ? t('editor.connected') : t('editor.connecting')
              }
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
          initialContent={!wsEnabled || isSynced ? initialContent : ''}
          onUpdate={onUpdate}
          placeholder={resolvedPlaceholder}
          editable={editable}
          saveStatus={saveStatus}
        />
      </div>
    </EditorErrorBoundary>
  );
}
