import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate, useParams } from '@tanstack/react-router';

import { StudyToolsTab } from '@/components/artifacts/StudyToolsTab';
import { CollaborativeEditor } from '@/components/editor/CollaborativeEditor';
import { MobileEditorHeader } from '@/components/editor/MobileEditorHeader';
import { NoteControlsPortal } from '@/components/editor/NoteControlsPortal';
import {
  workspacePanelId,
  workspaceTabId,
} from '@/components/editor/workspace-tab-ids';
import { WorkspaceTabBar } from '@/components/editor/WorkspaceTabBar';
import { NotePropertiesRow } from '@/components/organization/NotePropertiesRow';
import { OrganizeSuggestionCard } from '@/components/organization/OrganizeSuggestionCard';
import { VoiceNoteRecorder } from '@/components/voice-note/VoiceNoteRecorder';
import { ROUTES } from '@/config';
import { useAutoTitle } from '@/hooks/useAutoTitle';
import { useNotesListRefresh } from '@/hooks/useNotesListRefresh';
import { useNoteSuggestion } from '@/hooks/useNoteSuggestion';
import { canPerformNoteAction, DEBOUNCE_DELAYS } from '@/lib';
import { useAIStore } from '@/stores/ai.store';
import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { useVoiceNoteEditorStore } from '@/stores/voice-note-editor.store';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import type { Editor } from '@tiptap/react';
import { toast } from 'sonner';

import { docStateToBase64, useYjs } from '@knowtis/crdt';
import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { useNote, useUpdateNote } from '@knowtis/data-access-notes';
import { cn, ErrorState, Input, LoadingState } from '@knowtis/design-system';
import { useDebouncedMerge } from '@knowtis/shared-hooks';
import {
  ACCESS,
  FEATURE_FLAG_KEYS,
  type GeneralAccessLevel,
  type NoteAccessLevel,
  type ParaBucket,
  type PermissionLevel,
  type Supertag,
  type SupertagFields,
} from '@knowtis/shared-types';

interface NoteEditorProps {
  noteId: string;
  initialTitle: string;
  initialContent: string;
  accessLevel: NoteAccessLevel;
  bucket: ParaBucket | null;
  tags: string[];
  supertag: Supertag | null;
  supertagFields: SupertagFields | null;
  generalAccess: GeneralAccessLevel;
  generalAccessPermission: PermissionLevel;
  shareToken: string | null;
  editorsCanShare: boolean;
}

function NoteEditor({
  noteId,
  initialTitle,
  initialContent,
  accessLevel,
  bucket,
  tags,
  supertag,
  supertagFields,
  generalAccess,
  generalAccessPermission,
  shareToken,
  editorsCanShare,
}: NoteEditorProps) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const isAnonymous = useAuthUser()?.isAnonymous ?? false;
  const canEdit = canPerformNoteAction(accessLevel, 'update');
  const isOwner = accessLevel === ACCESS.OWNER;
  const aiEnabled = useAIStore((s) => s.aiEnabled);
  const autoOrganizeEnabled = useFeatureFlag(
    FEATURE_FLAG_KEYS.AI_AUTO_ORGANIZE
  );
  const suggestionsEnabled =
    aiEnabled && autoOrganizeEnabled && !isAnonymous && isOwner;
  const suggestion = useNoteSuggestion({
    noteId,
    bucket,
    isOwner,
    enabled: suggestionsEnabled,
  });
  const reportEditRef = useRef(suggestion.reportEdit);
  useEffect(() => {
    reportEditRef.current = suggestion.reportEdit;
  }, [suggestion.reportEdit]);
  const updateNote = useUpdateNote();
  const { getYDoc } = useYjs();
  const refreshNotesList = useNotesListRefresh();
  const isNewNote = useMemo(() => !initialContent, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isPendingUpdate, setIsPendingUpdate] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const pendingUpdateRef = useRef(false);
  const contentRef = useRef(initialContent);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const isLiveCollabRef = useRef(false);
  const handleLiveCollaborationChange = useCallback((isLive: boolean) => {
    isLiveCollabRef.current = isLive;
  }, []);

  const requestSuggestion = suggestion.request;
  const handleSuggest = useCallback(
    () => requestSuggestion(contentRef.current),
    [requestSuggestion]
  );

  const debouncedUpdateNote = useDebouncedMerge<{
    title: string;
    content: string;
  }>((updates) => {
    pendingUpdateRef.current = true;
    setIsPendingUpdate(true);
    // Content saves carry the doc's own CRDT state: the server stores it
    // verbatim, so it never mints a parallel history from the HTML — the
    // root cause of notes duplicating on reload.
    updateNote.mutate(
      {
        id: noteId,
        input: updates,
        ...(updates.content !== undefined
          ? { yjsState: docStateToBase64(getYDoc(noteId)) }
          : {}),
      },
      {
        onSuccess: () => {
          setLastSaved(new Date());
          pendingUpdateRef.current = false;
          setIsPendingUpdate(false);
        },
        onError: () => {
          pendingUpdateRef.current = false;
          setIsPendingUpdate(false);
        },
      }
    );
  }, DEBOUNCE_DELAYS.AUTO_SAVE);

  const defaultTitle = t('sidebar.untitled');
  const {
    title,
    handleTitleChange: onTitleChange,
    deriveAutoTitle,
  } = useAutoTitle({
    initialTitle,
    defaultTitle,
    onAutoTitleChange: (newTitle) => debouncedUpdateNote({ title: newTitle }),
  });

  const setActiveNoteId = useArtifactSidebarStore((s) => s.setActiveNoteId);
  const workspaceTab = useWorkspaceStore((s) => s.activeTab);
  const setWorkspaceTab = useWorkspaceStore((s) => s.setTab);

  useEffect(() => {
    setActiveNoteId(noteId);
    setWorkspaceTab('note');
    return () => setActiveNoteId(null);
  }, [noteId, setActiveNoteId, setWorkspaceTab]);

  const voiceNoteOpen = useVoiceNoteEditorStore((s) => s.isOpen);
  const voiceNoteClose = useVoiceNoteEditorStore((s) => s.close);
  const voiceNoteEditorOpen = useVoiceNoteEditorStore((s) => s.open);
  const insertPosition = useVoiceNoteEditorStore((s) => s.insertPosition);
  const preAcquiredStream = useVoiceNoteEditorStore((s) => s.preAcquiredStream);

  useEffect(() => {
    return () => {
      voiceNoteClose();
    };
  }, [voiceNoteClose]);

  useEffect(() => {
    const originalTitle = document.title;
    document.title = `${title} · Knowtis`;
    return () => {
      document.title = originalTitle;
    };
  }, [title]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) {
      return;
    }
    const newTitle = e.target.value;
    onTitleChange(newTitle);
    debouncedUpdateNote({ title: newTitle });
  };

  const handleContentChange = useCallback(
    (newContent: string) => {
      if (!canEdit) {
        return;
      }
      if (newContent === contentRef.current) {
        return;
      }
      contentRef.current = newContent;
      if (!isLiveCollabRef.current) {
        // Live CRDT already holds these edits and persists them via Hocuspocus
        // onStoreDocument; a REST content write would echo back and reset the caret.
        debouncedUpdateNote({ content: newContent });
      } else {
        refreshNotesList();
      }
      reportEditRef.current(newContent);
      deriveAutoTitle(newContent);
    },
    [canEdit, debouncedUpdateNote, deriveAutoTitle, refreshNotesList]
  );

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  const handleVoiceInsert = useCallback(
    (htmlContent: string) => {
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed) {
        return;
      }

      const pos = insertPosition ?? editor.state.selection.to;
      editor
        .chain()
        .focus()
        .setTextSelection(pos)
        .insertContent(htmlContent)
        .run();
    },
    [insertPosition]
  );

  const handleVoiceNoteClick = useCallback(async () => {
    const editor = editorRef.current;
    const pos = editor && !editor.isDestroyed ? editor.state.selection.to : 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceNoteEditorOpen(pos, stream);
    } catch (e) {
      console.warn('[NoteEditorPage] Microphone access failed:', e);
      toast.error(t('ai.voice.micGenericError'));
    }
  }, [voiceNoteEditorOpen, t]);

  const isSaving = updateNote.isPending || isPendingUpdate;
  const openShareDialog = () => setIsShareDialogOpen(true);
  const showVoiceNote = canEdit && aiEnabled;

  return (
    <div className="mx-auto max-w-4xl">
      <MobileEditorHeader
        noteId={noteId}
        noteTitle={title}
        accessLevel={accessLevel}
        editorsCanShare={editorsCanShare}
        onShareClick={openShareDialog}
        onBack={() => navigate({ to: ROUTES.DASHBOARD })}
      />

      <NoteControlsPortal
        note={{
          id: noteId,
          title,
          accessLevel,
          editorsCanShare,
          generalAccess,
          generalAccessPermission,
          shareToken,
        }}
        isSaving={isSaving}
        hasSaved={!!lastSaved}
        shareDialogOpen={isShareDialogOpen}
        onShareDialogOpenChange={setIsShareDialogOpen}
      />

      {aiEnabled && <WorkspaceTabBar noteId={noteId} />}

      <div
        {...(aiEnabled
          ? {
              id: workspacePanelId('note'),
              role: 'tabpanel' as const,
              'aria-labelledby': workspaceTabId('note'),
              tabIndex: 0,
            }
          : {})}
        className={cn(aiEnabled && workspaceTab !== 'note' && 'hidden')}
      >
        <div className="mb-4">
          <Input
            ref={titleInputRef}
            value={title}
            onChange={handleTitleChange}
            readOnly={!canEdit}
            placeholder={t('editor.titlePlaceholder')}
            className="border-0 bg-transparent px-0 text-2xl font-bold focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {!isAnonymous && (
          <NotePropertiesRow
            noteId={noteId}
            bucket={bucket}
            tags={tags}
            supertag={supertag}
            supertagFields={supertagFields}
            isOwner={accessLevel === ACCESS.OWNER}
            {...(suggestionsEnabled ? { onSuggest: handleSuggest } : {})}
            isSuggesting={suggestion.isPending}
          />
        )}

        {suggestion.suggestion && (
          <OrganizeSuggestionCard
            suggestion={suggestion.suggestion}
            currentBucket={bucket}
            currentTags={tags}
            onDismiss={suggestion.dismiss}
          />
        )}

        <CollaborativeEditor
          noteId={noteId}
          initialContent={initialContent}
          onUpdate={handleContentChange}
          editable={canEdit}
          canTag={!isAnonymous && accessLevel === ACCESS.OWNER}
          autoFocus={canEdit && isNewNote}
          localFirst={isNewNote}
          onEditorReady={handleEditorReady}
          onVoiceNote={showVoiceNote ? handleVoiceNoteClick : undefined}
          onLiveCollaborationChange={handleLiveCollaborationChange}
        />

        {showVoiceNote && (
          <VoiceNoteRecorder
            mode="insert"
            open={voiceNoteOpen}
            onClose={voiceNoteClose}
            onInsert={handleVoiceInsert}
            preAcquiredStream={preAcquiredStream}
          />
        )}
      </div>

      {aiEnabled && (
        <div
          id={workspacePanelId('estudio')}
          role="tabpanel"
          aria-labelledby={workspaceTabId('estudio')}
          tabIndex={0}
          className={cn(workspaceTab !== 'estudio' && 'hidden')}
        >
          <StudyToolsTab noteId={noteId} />
        </div>
      )}
    </div>
  );
}

export function NoteEditorPage() {
  const { noteId } = useParams({ from: '/_app/notes/$noteId' });
  const navigate = useNavigate();
  const { t } = useTranslation('notes');

  const { data: note, isLoading, isError, error } = useNote(noteId);

  if (isLoading) {
    return <LoadingState message={t('editor.loadingNote')} />;
  }

  if (isError) {
    return (
      <ErrorState
        title={t('editor.failedToLoad')}
        message={error instanceof Error ? error.message : t('editor.notFound')}
        onRetry={() => navigate({ to: ROUTES.DASHBOARD })}
        retryLabel={t('editor.backToNotes')}
      />
    );
  }

  if (!note) {
    return null;
  }

  return (
    <NoteEditor
      key={note.id}
      noteId={note.id}
      initialTitle={note.title}
      initialContent={note.content}
      accessLevel={note.accessLevel}
      bucket={note.bucket}
      tags={note.tags}
      supertag={note.supertag}
      supertagFields={note.supertagFields}
      generalAccess={note.generalAccess}
      generalAccessPermission={note.generalAccessPermission}
      shareToken={note.shareToken}
      editorsCanShare={note.editorsCanShare}
    />
  );
}
