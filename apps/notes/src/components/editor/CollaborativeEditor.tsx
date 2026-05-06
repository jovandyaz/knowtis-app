import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getCollaborationServerUrl,
  isWebSocketEnabled,
  useHocuspocusCollaboration,
} from '@/collaboration/useHocuspocusCollaboration';
import {
  useActiveCollaborators,
  useCollaborativeEditor,
  usePresenceBroadcast,
} from '@/hooks';
import { useAIStore } from '@/stores/ai.store';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';

import { cn } from '@knowtis/design-system';
import {
  CollaborationIndicator,
  EditorErrorBoundary,
  EditorToolbar,
  shouldPropagateUpdate,
  TableControls,
} from '@knowtis/editor';
import { isTrivialProseMirrorDoc } from '@knowtis/editor-schema';
import { useTypewriter } from '@knowtis/shared-hooks';
import { logger } from '@knowtis/shared-util';

import { AIBubbleMenu } from './ai/AIBubbleMenu';
import { AIResultPanel } from './ai/AIResultPanel';
import type {
  CollaborativeEditorProps,
  InternalEditorProps,
} from './CollaborativeEditor.types';
import { useEditorExtensions } from './useEditorExtensions';

const EDITOR_PADDING = 'p-4 md:p-6';

const EDITOR_CONTAINER_CLASSES = cn(
  'rounded-2xl border border-border bg-card/50 backdrop-blur-sm',
  'transition-all duration-300',
  'focus-within:border-primary/50 focus-within:shadow-lg focus-within:shadow-primary/5'
);

function TypewriterPlaceholder({ texts }: { texts: string[] }) {
  const text = useTypewriter({
    texts,
    speed: 60,
    deleteSpeed: 35,
    waitTime: 2000,
  });

  return (
    <div
      aria-hidden="true"
      className={cn(
        'absolute top-0 left-0 pointer-events-none text-muted-foreground/50 select-none',
        EDITOR_PADDING
      )}
    >
      {text}
    </div>
  );
}

function InternalEditor({
  yDoc,
  yXmlFragment,
  awareness,
  currentUser,
  initialContent,
  onUpdate,
  placeholder,
  editable,
  isSynced,
  autoFocus,
  onEditorReady,
  onVoiceNote,
}: InternalEditorProps) {
  const aiEnabled = useAIStore((s) => s.aiEnabled);

  const onUpdateRef = useRef(onUpdate);
  const isInitializingRef = useRef(false);
  const isSyncedRef = useRef(isSynced);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    isSyncedRef.current = isSynced;
  }, [isSynced]);

  const extensions = useEditorExtensions(
    yDoc,
    yXmlFragment,
    awareness,
    currentUser
  );

  const editor = useEditor({
    extensions,
    editable,
    autofocus: autoFocus ? 'start' : false,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm sm:prose-base max-w-none',
          `min-h-[300px] ${EDITOR_PADDING}`,
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
      if (
        !shouldPropagateUpdate({
          isInitializing: isInitializingRef.current,
          isSynced: isSyncedRef.current,
        })
      ) {
        return;
      }
      const html = editor.getHTML();
      queueMicrotask(() => onUpdateRef.current(html));
    },
  });

  const editorIsEmpty = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e ? isTrivialProseMirrorDoc(e.state.doc) : true,
  });

  useEffect(() => {
    if (!editor || !yXmlFragment || !initialContent) {
      return;
    }

    try {
      if (yXmlFragment.length === 0) {
        isInitializingRef.current = true;
        editor.commands.setContent(initialContent);
        queueMicrotask(() => {
          isInitializingRef.current = false;
        });
      }
    } catch (error) {
      isInitializingRef.current = false;
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

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      onEditorReady?.(editor);
    }
  }, [editor, onEditorReady]);

  return (
    <>
      <EditorToolbar editor={editor} onVoiceNote={onVoiceNote} />
      <div className={cn(EDITOR_CONTAINER_CLASSES, 'relative')}>
        {editor && aiEnabled && (
          <>
            <AIBubbleMenu editor={editor} />
            <AIResultPanel editor={editor} />
          </>
        )}
        {editor && editor.isEditable && <TableControls editor={editor} />}
        {editorIsEmpty && <TypewriterPlaceholder texts={placeholder} />}
        <EditorContent
          editor={editor}
          className="[&_.ProseMirror]:min-h-[300px]"
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
  autoFocus,
  onEditorReady,
  onVoiceNote,
  localFirst = false,
}: CollaborativeEditorProps) {
  const { t } = useTranslation('notes');
  const aiEnabled = useAIStore((s) => s.aiEnabled);
  const collaborationEnabled = !localFirst;
  const editorState = useCollaborativeEditor(noteId, {
    skipProviderDelay: localFirst,
  });
  const otherUsers = useActiveCollaborators(noteId, {
    enabled: collaborationEnabled,
  });
  usePresenceBroadcast(noteId, { enabled: collaborationEnabled });

  const resolvedPlaceholder: string[] = placeholder
    ? [placeholder]
    : aiEnabled
      ? [
          t('editor.placeholderWrite'),
          t('editor.placeholderSlash'),
          t('editor.placeholderVoice'),
          t('editor.placeholderLearn'),
          t('editor.placeholderStudyTools'),
        ]
      : [t('editor.editorPlaceholder')];

  const wsEnabled = collaborationEnabled && isWebSocketEnabled();
  const { isConnected, isSynced } = useHocuspocusCollaboration({
    noteId,
    yDoc: editorState.yDoc,
    awareness: editorState.awareness,
    serverUrl: getCollaborationServerUrl(),
    enabled: wsEnabled,
    shareToken,
    onEditDenied,
  });

  const uniqueUsers = otherUsers.filter(
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
          isSynced={!wsEnabled || isSynced}
          autoFocus={autoFocus}
          onEditorReady={onEditorReady}
          onVoiceNote={onVoiceNote}
        />
      </div>
    </EditorErrorBoundary>
  );
}
