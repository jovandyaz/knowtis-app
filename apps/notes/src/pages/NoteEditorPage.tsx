import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate, useParams, useSearch } from '@tanstack/react-router';

import { CollaborativeEditor } from '@/components/editor';
import { SaveStatusIndicator } from '@/components/editor/SaveStatusIndicator';
import { FloatingActionButton } from '@/components/layout/FloatingActionButton';
import { ShareDialog } from '@/components/notes/ShareDialog';
import { VoiceNoteRecorder } from '@/components/voice-note/VoiceNoteRecorder';
import { useAutoTitle } from '@/hooks/useAutoTitle';
import {
  ACCESS_BADGE_CONFIG,
  canPerformNoteAction,
  DEBOUNCE_DELAYS,
} from '@/lib';
import { useAIStore } from '@/stores/ai.store';
import { useVoiceNoteEditorStore } from '@/stores/voice-note-editor.store';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, Share2 } from 'lucide-react';
import { toast } from 'sonner';

import { useNote, useUpdateNote } from '@knowtis/data-access-notes';
import {
  Badge,
  Button,
  ErrorState,
  Input,
  LoadingState,
  VoiceButton,
} from '@knowtis/design-system';
import { useDebouncedCallback } from '@knowtis/shared-hooks';
import type {
  GeneralAccessLevel,
  NoteAccessLevel,
  PermissionLevel,
} from '@knowtis/shared-types';

interface NoteEditorProps {
  noteId: string;
  initialTitle: string;
  initialContent: string;
  accessLevel: NoteAccessLevel;
  generalAccess: GeneralAccessLevel;
  generalAccessPermission: PermissionLevel;
  shareToken: string | null;
  editorsCanShare: boolean;
  autoFocusTitle?: boolean | undefined;
  autoFocusContent?: boolean | undefined;
}

interface MobileEditorHeaderProps {
  accessLevel: NoteAccessLevel;
  editorsCanShare: boolean;
  onShareClick: () => void;
  onBack: () => void;
}

function MobileEditorHeader({
  accessLevel,
  editorsCanShare,
  onShareClick,
  onBack,
}: MobileEditorHeaderProps) {
  const { t } = useTranslation('notes');

  return (
    <>
      <FloatingActionButton
        icon={ArrowLeft}
        position="left"
        onClick={onBack}
        aria-label={t('editor.back')}
      />
      {canPerformNoteAction(accessLevel, 'share', { editorsCanShare }) && (
        <FloatingActionButton
          icon={Share2}
          position="right"
          onClick={onShareClick}
          aria-label={t('editor.share')}
        />
      )}

      <div className="h-14 md:hidden" />
    </>
  );
}

interface DesktopEditorHeaderProps {
  accessLevel: NoteAccessLevel;
  editorsCanShare: boolean;
  canEdit: boolean;
  isSaving: boolean;
  hasSaved: boolean;
  onShareClick: () => void;
  onVoiceNoteClick?: () => void;
  showVoiceNote: boolean;
}

function DesktopEditorHeader({
  accessLevel,
  editorsCanShare,
  canEdit,
  isSaving,
  hasSaved,
  onShareClick,
  onVoiceNoteClick,
  showVoiceNote,
}: DesktopEditorHeaderProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const badgeConfig = ACCESS_BADGE_CONFIG[accessLevel];
  const showBadge = accessLevel !== 'owner';

  return (
    <div className="mb-6 hidden md:flex items-center justify-between">
      <div className="flex items-center gap-2">
        {showBadge && (
          <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-(--muted-foreground)">
        {canEdit &&
          (isSaving ? (
            <SaveStatusIndicator
              status="saving"
              label={tCommon('states.saving')}
              className="text-sm"
            />
          ) : hasSaved ? (
            <SaveStatusIndicator
              status="saved"
              label={tCommon('states.saved')}
              className="text-sm"
            />
          ) : null)}

        {showVoiceNote && (
          <VoiceButton
            size="sm"
            onClick={onVoiceNoteClick}
            aria-label={t('ai.voice.recordVoiceNote')}
          />
        )}

        {canPerformNoteAction(accessLevel, 'share', { editorsCanShare }) && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onShareClick}
          >
            <Share2 className="h-4 w-4" />
            {t('editor.share')}
          </Button>
        )}
      </div>
    </div>
  );
}

function NoteEditor({
  noteId,
  initialTitle,
  initialContent,
  accessLevel,
  generalAccess,
  generalAccessPermission,
  shareToken,
  editorsCanShare,
  autoFocusTitle,
  autoFocusContent,
}: NoteEditorProps) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const canEdit = canPerformNoteAction(accessLevel, 'update');
  const updateNote = useUpdateNote();
  const [content, setContent] = useState(initialContent);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isPendingUpdate, setIsPendingUpdate] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const pendingUpdateRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const debouncedUpdateNote = useDebouncedCallback(
    (updates: { title?: string; content?: string }) => {
      pendingUpdateRef.current = true;
      setIsPendingUpdate(true);
      updateNote.mutate(
        { id: noteId, input: updates },
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
    },
    DEBOUNCE_DELAYS.AUTO_SAVE
  );

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

  const aiEnabled = useAIStore((s) => s.aiEnabled);
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
    if (autoFocusTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [autoFocusTitle]);

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
      setContent(newContent);
      debouncedUpdateNote({ content: newContent });
      deriveAutoTitle(newContent);
    },
    [canEdit, debouncedUpdateNote, deriveAutoTitle]
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
        accessLevel={accessLevel}
        editorsCanShare={editorsCanShare}
        onShareClick={openShareDialog}
        onBack={() => navigate({ to: '/' })}
      />

      <DesktopEditorHeader
        accessLevel={accessLevel}
        editorsCanShare={editorsCanShare}
        canEdit={canEdit}
        isSaving={isSaving}
        hasSaved={!!lastSaved}
        onShareClick={openShareDialog}
        onVoiceNoteClick={handleVoiceNoteClick}
        showVoiceNote={showVoiceNote}
      />

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

      <CollaborativeEditor
        noteId={noteId}
        initialContent={content}
        onUpdate={handleContentChange}
        editable={canEdit}
        saveStatus={isSaving ? 'saving' : lastSaved ? 'saved' : undefined}
        autoFocus={autoFocusContent}
        onEditorReady={handleEditorReady}
        onVoiceNote={showVoiceNote ? handleVoiceNoteClick : undefined}
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

      {canPerformNoteAction(accessLevel, 'share', { editorsCanShare }) && (
        <ShareDialog
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          noteId={noteId}
          noteTitle={title}
          generalAccess={generalAccess}
          generalAccessPermission={generalAccessPermission}
          shareToken={shareToken}
          editorsCanShare={editorsCanShare}
          accessLevel={accessLevel}
        />
      )}
    </div>
  );
}

export function NoteEditorPage() {
  const { noteId } = useParams({ from: '/_app/notes/$noteId' });
  const { focus } = useSearch({ from: '/_app/notes/$noteId' });
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
        onRetry={() => navigate({ to: '/' })}
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
      generalAccess={note.generalAccess}
      generalAccessPermission={note.generalAccessPermission}
      shareToken={note.shareToken}
      editorsCanShare={note.editorsCanShare}
      autoFocusTitle={focus === 'title'}
      autoFocusContent={focus === 'content'}
    />
  );
}
