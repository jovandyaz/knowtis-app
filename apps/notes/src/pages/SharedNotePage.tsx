import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Link, useParams } from '@tanstack/react-router';

import { CollaborativeEditor, ReadOnlyEditor } from '@/components/editor';
import { KnowtisLogo } from '@/components/layout/KnowtisLogo';
import { ROUTES } from '@/config';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';
import { Eye, Pencil } from 'lucide-react';

import { ApiClientError } from '@knowtis/api-client';
import { useNoteByToken } from '@knowtis/data-access-notes';
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
} from '@knowtis/design-system';
import { PERMISSION } from '@knowtis/shared-types';

export function SharedNotePage() {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const { token } = useParams({ from: '/s/$token' });
  const { data, isLoading, isError, error } = useNoteByToken(token);
  const [isEditing, setIsEditing] = useState(false);
  const [latestContent, setLatestContent] = useState<string | null>(null);

  const handleEditDenied = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleUpdate = useCallback((content: string) => {
    setLatestContent(content);
  }, []);

  const handleStopEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message={t('shared.loadingSharedNote')} />
      </div>
    );
  }

  if (isError) {
    const isNotFound =
      ApiClientError.isApiClientError(error) && error.status === 404;

    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorState
          fullHeight={false}
          title={
            isNotFound
              ? t('shared.linkNotFound')
              : tCommon('errors.somethingWentWrong')
          }
          message={
            isNotFound
              ? t('shared.linkNotFoundDesc')
              : t('shared.failedToLoadShared')
          }
        />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const canEdit = data.accessLevel === PERMISSION.EDITOR;
  const displayContent = latestContent ?? data.content;

  return (
    <div className="min-h-screen bg-(--background)">
      {/* Minimal header */}
      <header className="sticky top-0 z-40 border-b border-border/30 bg-(--card)/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <KnowtisLogo className="h-5 w-auto text-primary" />
            <Badge variant={canEdit ? 'default' : 'secondary'}>
              {canEdit ? (
                <span className="flex items-center gap-1">
                  <Pencil className="h-3 w-3" />
                  {t('shared.editorBadge')}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {t('shared.viewOnlyBadge')}
                </span>
              )}
            </Badge>
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground/50">
              <span>{data.owner.name}</span>
              <span>&middot;</span>
              <span>{format(new Date(data.updatedAt), 'MMM d, yyyy')}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !isEditing && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                {t('shared.editButton')}
              </Button>
            )}
            {isEditing && (
              <Button variant="outline" size="sm" onClick={handleStopEditing}>
                <Eye className="mr-1 h-3 w-3" />
                {t('shared.viewButton')}
              </Button>
            )}
            <Link to={ROUTES.LOGIN} search={{ redirect: undefined }}>
              <Button variant="outline" size="sm">
                {t('shared.signIn')}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Note content */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        {isEditing ? (
          <CollaborativeEditor
            noteId={data.id}
            initialContent={data.content}
            onUpdate={handleUpdate}
            editable={true}
            shareToken={token}
            onEditDenied={handleEditDenied}
          />
        ) : (
          <ReadOnlyEditor content={DOMPurify.sanitize(displayContent)} />
        )}
      </main>
    </div>
  );
}
