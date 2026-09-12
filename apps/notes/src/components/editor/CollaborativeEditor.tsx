import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import {
  authStore,
  performSessionLogout,
  refreshAccessToken,
  tokenStorage,
} from '@/auth';
import {
  getCollaborationServerUrl,
  isWebSocketEnabled,
  useHocuspocusCollaboration,
} from '@/collaboration/useHocuspocusCollaboration';
import { ROUTES } from '@/config';
import {
  useActiveCollaborators,
  useAISettings,
  useCollaborativeEditor,
  usePresenceBroadcast,
  useUpdateAISettings,
} from '@/hooks';
import { queryClient } from '@/lib/query-client';
import { useAIMenuStore } from '@/stores/ai-menu.store';
import { useAIStore } from '@/stores/ai.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';

import { notesQueryKeys } from '@knowtis/data-access-notes';
import { cn, DocumentSkeleton, ErrorState } from '@knowtis/design-system';
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

import { AIMenuPopover } from './ai/AIMenuPopover';
import { AIResultPanel } from './ai/AIResultPanel';
import type {
  CollaborativeEditorProps,
  InternalEditorProps,
} from './CollaborativeEditor.types';
import {
  EDITOR_CONTAINER_CLASSES,
  EDITOR_MIN_HEIGHT,
  EDITOR_PADDING,
} from './editor-container.styles';
import { EditorCardSkeleton } from './EditorCardSkeleton';
import { openImagePicker } from './image/imagePicker';
import { useEditorExtensions } from './useEditorExtensions';

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

const SYNC_SKELETON_LINES = 6;

function SyncSkeleton({ label }: { label: string }) {
  return (
    <div
      className={cn(
        'absolute inset-x-0 top-0 pointer-events-none',
        EDITOR_PADDING
      )}
    >
      <DocumentSkeleton
        showTitle={false}
        lines={SYNC_SKELETON_LINES}
        label={label}
      />
    </div>
  );
}

function InternalEditor({
  noteId,
  yDoc,
  yXmlFragment,
  awareness,
  currentUser,
  initialContent,
  onUpdate,
  placeholder,
  editable,
  isSynced,
  canTag,
  autoFocus,
  onEditorReady,
  onVoiceNote,
}: InternalEditorProps) {
  const { t } = useTranslation('notes');
  const aiEnabled = useAIStore((s) => s.aiEnabled);
  const openAIMenu = useAIMenuStore((s) => s.open);
  const handleAskAI = useCallback(() => openAIMenu(), [openAIMenu]);

  const isAnonymous = useAuthUser()?.isAnonymous ?? false;
  const canTuneAI = aiEnabled && !isAnonymous;
  const { data: aiPreferences, isError: preferencesFailed } =
    useAISettings(canTuneAI);
  const { mutate: updateAISettings } = useUpdateAISettings();
  const storedAutocomplete = preferencesFailed
    ? false
    : aiPreferences?.ghostTextEnabled;
  const autocompletePreference = canTuneAI ? storedAutocomplete : true;
  const autocompleteEnabled = autocompletePreference ?? true;

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
    noteId,
    yDoc,
    yXmlFragment,
    awareness,
    currentUser,
    canTag
  );

  const editor = useEditor({
    extensions,
    editable,
    autofocus: autoFocus ? 'start' : false,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm sm:prose-base max-w-none',
          `${EDITOR_MIN_HEIGHT} ${EDITOR_PADDING}`,
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

  const handleAddImage = useCallback(
    () =>
      openImagePicker((file) => {
        if (editor && !editor.isDestroyed) {
          editor.commands.uploadImageFile(file);
        }
      }),
    [editor]
  );

  const handleToggleAutocomplete = useCallback(
    () => updateAISettings({ ghostTextEnabled: !autocompleteEnabled }),
    [updateAISettings, autocompleteEnabled]
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed || autocompletePreference === undefined) {
      return;
    }
    editor.commands.setGhostTextEnabled(autocompletePreference);
  }, [editor, autocompletePreference]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !yXmlFragment || !initialContent) {
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
      <EditorToolbar
        editor={editor}
        onVoiceNote={onVoiceNote}
        onAskAI={aiEnabled ? handleAskAI : undefined}
        onAddImage={editable ? handleAddImage : undefined}
        autocompleteEnabled={autocompleteEnabled}
        onToggleAutocomplete={canTuneAI ? handleToggleAutocomplete : undefined}
      />
      <div className={cn(EDITOR_CONTAINER_CLASSES, 'relative')}>
        {editor && aiEnabled && (
          <>
            <AIMenuPopover editor={editor} />
            <AIResultPanel editor={editor} />
          </>
        )}
        {editor && editor.isEditable && <TableControls editor={editor} />}
        {/* isSynced flips back to false on every reconnect, so only an editor with nothing to show may be covered. */}
        {editorIsEmpty &&
          (isSynced ? (
            <TypewriterPlaceholder texts={placeholder} />
          ) : (
            <SyncSkeleton label={t('editor.loadingEditor')} />
          ))}
        <EditorContent editor={editor} />
      </div>

      <div className="h-16 md:hidden" />
    </>
  );
}

function EditorLoadingState() {
  const { t } = useTranslation('notes');

  return <EditorCardSkeleton label={t('editor.loadingEditor')} />;
}

export function CollaborativeEditor({
  noteId,
  initialContent,
  onUpdate,
  placeholder,
  className,
  editable = true,
  canTag = false,
  shareToken,
  onEditDenied,
  autoFocus,
  onEditorReady,
  onVoiceNote,
  localFirst = false,
  onLiveCollaborationChange,
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

  const navigate = useNavigate();

  const handleSessionExpired = useCallback(() => {
    // Logging out an account-less visitor looks wrong, but the dead token is
    // reused until cleared, and a share link has no login to fall back to.
    performSessionLogout({
      authStore,
      tokenStorage,
      ...(shareToken
        ? {}
        : {
            redirect: () => {
              navigate({
                to: ROUTES.LOGIN,
                search: { redirect: window.location.pathname },
              });
            },
          }),
    });
    if (shareToken) {
      onEditDenied?.();
    }
  }, [navigate, shareToken, onEditDenied]);

  const wsEnabled = collaborationEnabled && isWebSocketEnabled();
  const reconcileAccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: notesQueryKeys.all });
  }, []);

  const { status, isConnected, isSynced, readOnly } =
    useHocuspocusCollaboration({
      noteId,
      yDoc: editorState.yDoc,
      awareness: editorState.awareness,
      serverUrl: getCollaborationServerUrl(),
      enabled: wsEnabled,
      shareToken,
      onEditDenied,
      onAccessChanged: reconcileAccess,
      onAuthRefresh: refreshAccessToken,
      onSessionExpired: handleSessionExpired,
    });
  const accessDenied = status === 'accessDenied';

  useEffect(() => {
    onLiveCollaborationChange?.(wsEnabled && isConnected && isSynced);
  }, [wsEnabled, isConnected, isSynced, onLiveCollaborationChange]);

  if (!editorState.isReady) {
    return (
      <div className={cn('relative', className)}>
        <EditorLoadingState />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className={cn('relative', className)}>
        <ErrorState
          title={t('editor.accessLost')}
          message={t('editor.accessLostDesc')}
        />
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
                isConnected ? 'bg-(--success)' : 'bg-(--warning)'
              )}
              title={
                isConnected ? t('editor.connected') : t('editor.connecting')
              }
            />
          </div>
        )}

        {otherUsers.length > 0 && <CollaborationIndicator users={otherUsers} />}

        <InternalEditor
          noteId={noteId}
          yDoc={editorState.yDoc}
          yXmlFragment={editorState.yXmlFragment}
          awareness={editorState.awareness}
          currentUser={editorState.currentUser}
          // With a live provider the server hydrates; a client seed forks a duplicate CRDT copy
          initialContent={wsEnabled ? '' : initialContent}
          onUpdate={onUpdate}
          placeholder={resolvedPlaceholder}
          editable={
            editable && (!wsEnabled || (!readOnly && isConnected && isSynced))
          }
          isSynced={!wsEnabled || isSynced}
          canTag={canTag}
          autoFocus={autoFocus}
          onEditorReady={onEditorReady}
          onVoiceNote={onVoiceNote}
        />
      </div>
    </EditorErrorBoundary>
  );
}
