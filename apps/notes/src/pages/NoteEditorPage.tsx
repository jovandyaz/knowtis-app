import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { useNavigate, useParams } from '@tanstack/react-router';

import { CollaborativeEditor } from '@/components/editor';
import { SaveStatusIndicator } from '@/components/editor/SaveStatusIndicator';
import { FloatingActionButton } from '@/components/layout/FloatingActionButton';
import { ShareDialog } from '@/components/notes/ShareDialog';
import { VoiceNoteRecorder } from '@/components/voice-note/VoiceNoteRecorder';
import { ROUTES } from '@/config';
import { useAutoTitle } from '@/hooks/useAutoTitle';
import {
  ACCESS_BADGE_CONFIG,
  canPerformNoteAction,
  DEBOUNCE_DELAYS,
} from '@/lib';
import { useAIStore } from '@/stores/ai.store';
import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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

interface NoteControlsPortalProps {
  accessLevel: NoteAccessLevel;
  editorsCanShare: boolean;
  canEdit: boolean;
  isSaving: boolean;
  hasSaved: boolean;
  onShareClick: () => void;
}

function NoteControlsPortal({
  accessLevel,
  editorsCanShare,
  canEdit,
  isSaving,
  hasSaved,
  onShareClick,
}: NoteControlsPortalProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const badgeConfig = ACCESS_BADGE_CONFIG[accessLevel];
  const showBadge = accessLevel !== 'owner';

  const portalTarget = document.getElementById('note-controls-portal');
  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <TooltipProvider delayDuration={300}>
      {showBadge && (
        <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
      )}

      {canEdit &&
        (isSaving ? (
          <SaveStatusIndicator
            status="saving"
            label={tCommon('states.saving')}
            className="text-xs text-(--muted-foreground)"
            transient
          />
        ) : hasSaved ? (
          <SaveStatusIndicator
            status="saved"
            label={tCommon('states.saved')}
            className="text-xs text-(--muted-foreground)"
            transient
          />
        ) : null)}

      {canPerformNoteAction(accessLevel, 'share', {
        editorsCanShare,
      }) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-(--muted-foreground) hover:text-(--foreground)"
              onClick={onShareClick}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('editor.share')}</TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>,
    portalTarget
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
}: NoteEditorProps) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const canEdit = canPerformNoteAction(accessLevel, 'update');
  const updateNote = useUpdateNote();
  const [content, setContent] = useState(initialContent);
  // Stable for the lifetime of this mount (component remounts via key={noteId}).
  const isNewNote = useMemo(() => !initialContent, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isPendingUpdate, setIsPendingUpdate] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const pendingUpdateRef = useRef(false);
  const contentRef = useRef(initialContent);
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
  const setActiveNoteId = useArtifactSidebarStore((s) => s.setActiveNoteId);

  useEffect(() => {
    setActiveNoteId(noteId);
    return () => setActiveNoteId(null);
  }, [noteId, setActiveNoteId]);

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
        onBack={() => navigate({ to: ROUTES.DASHBOARD })}
      />

      <NoteControlsPortal
        accessLevel={accessLevel}
        editorsCanShare={editorsCanShare}
        canEdit={canEdit}
        isSaving={isSaving}
        hasSaved={!!lastSaved}
        onShareClick={openShareDialog}
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
        autoFocus={canEdit && isNewNote}
        localFirst={isNewNote}
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
      generalAccess={note.generalAccess}
      generalAccessPermission={note.generalAccessPermission}
      shareToken={note.shareToken}
      editorsCanShare={note.editorsCanShare}
    />
  );
}
