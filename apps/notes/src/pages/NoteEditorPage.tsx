import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Link, useNavigate, useParams } from '@tanstack/react-router';

import { CollaborativeEditor } from '@/components/editor';
import { ShareDialog } from '@/components/notes/ShareDialog';
import {
  ACCESS_BADGE_CONFIG,
  canPerformNoteAction,
  DEBOUNCE_DELAYS,
  formatNoteDateFull,
} from '@/lib';
import { ArrowLeft, Check, Loader2, Share2 } from 'lucide-react';

import { useNote, useUpdateNote } from '@knowtis/data-access-notes';
import {
  Badge,
  Button,
  ErrorState,
  Input,
  LoadingState,
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
  updatedAt: Date;
  accessLevel: NoteAccessLevel;
  generalAccess: GeneralAccessLevel;
  generalAccessPermission: PermissionLevel;
  shareToken: string | null;
  editorsCanShare: boolean;
}

function NoteEditor({
  noteId,
  initialTitle,
  initialContent,
  updatedAt,
  accessLevel,
  generalAccess,
  generalAccessPermission,
  shareToken,
  editorsCanShare,
}: NoteEditorProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const canEdit = canPerformNoteAction(accessLevel, 'update');
  const updateNote = useUpdateNote();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isPendingUpdate, setIsPendingUpdate] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const pendingUpdateRef = useRef(false);

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

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) {
      return;
    }
    const newTitle = e.target.value;
    setTitle(newTitle);
    debouncedUpdateNote({ title: newTitle });
  };

  const handleContentChange = useCallback(
    (newContent: string) => {
      if (!canEdit) {
        return;
      }
      setContent(newContent);
      debouncedUpdateNote({ content: newContent });
    },
    [canEdit, debouncedUpdateNote]
  );

  const isSaving = updateNote.isPending || isPendingUpdate;
  const badgeConfig = ACCESS_BADGE_CONFIG[accessLevel];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/notes">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t('editor.backToNotes')}
            </Button>
          </Link>

          <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
        </div>

        <div className="flex items-center gap-2 text-sm text-(--muted-foreground)">
          {canEdit &&
            (isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{tCommon('states.saving')}</span>
              </>
            ) : lastSaved ? (
              <>
                <Check className="h-4 w-4 text-emerald-500" />
                <span>{tCommon('states.saved')}</span>
              </>
            ) : null)}

          {canPerformNoteAction(accessLevel, 'share') && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setIsShareDialogOpen(true)}
              >
                <Share2 className="h-4 w-4" />
                {t('editor.share')}
              </Button>

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
            </>
          )}
        </div>
      </div>

      <div className="mb-4">
        <Input
          value={title}
          onChange={handleTitleChange}
          readOnly={!canEdit}
          placeholder={t('editor.titlePlaceholder')}
          className="border-0 bg-transparent px-0 text-2xl font-bold focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      <div className="mb-6 text-sm text-(--muted-foreground)">
        {t('editor.lastUpdated')} {formatNoteDateFull(updatedAt)}
      </div>

      <CollaborativeEditor
        noteId={noteId}
        initialContent={content}
        onUpdate={handleContentChange}
        placeholder={t('editor.editorPlaceholder')}
        editable={canEdit}
      />
    </div>
  );
}

export function NoteEditorPage() {
  const { noteId } = useParams({ from: '/_authenticated/notes/$noteId' });
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
      updatedAt={note.updatedAt}
      accessLevel={note.accessLevel}
      generalAccess={note.generalAccess}
      generalAccessPermission={note.generalAccessPermission}
      shareToken={note.shareToken}
      editorsCanShare={note.editorsCanShare}
    />
  );
}
