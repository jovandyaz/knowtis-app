import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useParams } from '@tanstack/react-router';

import { StudyToolsTab } from '@/components/artifacts/StudyToolsTab';
import { CollaborativeEditor } from '@/components/editor/CollaborativeEditor';
import { SharedNoteAccessError } from '@/components/notes/shared-note/SharedNoteAccessError';
import { SharedNoteHeader } from '@/components/notes/shared-note/SharedNoteHeader';
import { WorkspaceTabBar } from '@/components/workspace/WorkspaceTabBar';
import { WorkspaceTabPanel } from '@/components/workspace/WorkspaceTabPanel';
import { sharedNotePath } from '@/config';
import { useCopyLink } from '@/hooks/useCopyLink';
import { useSharedNoteEditing } from '@/hooks/useSharedNoteEditing';
import { captureProductEvent } from '@/lib/analytics/product-events';
import { useWorkspaceTabReset } from '@/stores/useWorkspaceTabReset';
import { useAuthLoading, useAuthUser } from '@jovandyaz/auth-react';

import { ApiClientError } from '@knowtis/api-client';
import { useSharedNoteArtifacts } from '@knowtis/data-access-artifacts';
import { useNoteByToken } from '@knowtis/data-access-notes';
import { Button, LoadingState } from '@knowtis/design-system';
import { ReadOnlyEditor } from '@knowtis/editor';
import { PERMISSION, type Artifact } from '@knowtis/shared-types';

const HTTP_NOT_FOUND = 404;
const NO_ARTIFACTS: Artifact[] = [];
const TERMINAL_ACCESS_STATUSES = new Set([401, 403, HTTP_NOT_FOUND]);

export function SharedNotePage() {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const { token } = useParams({ from: '/s/$token' });
  const { data, isLoading, isError, isFetching, error, refetch } =
    useNoteByToken(token);
  const user = useAuthUser();
  const isAuthLoading = useAuthLoading();
  const { data: artifacts } = useSharedNoteArtifacts(token);
  const {
    isEditing,
    isPreparingEdit,
    latestContent,
    handleStartEditing,
    handleStopEditing,
    handleEditDenied,
    handleUpdate,
  } = useSharedNoteEditing();
  const { copied, copy: copyLink } = useCopyLink();
  const sharedArtifacts = artifacts ?? NO_ARTIFACTS;
  const hasArtifacts = sharedArtifacts.length > 0;
  const sharedPath = sharedNotePath(token);
  const capturedTokenRef = useRef<string | null>(null);
  const permission =
    data?.accessLevel === PERMISSION.VIEWER ||
    data?.accessLevel === PERMISSION.EDITOR
      ? data.accessLevel
      : undefined;
  const isAnonymousVisitor = user === null || user.isAnonymous === true;
  const actorType = isAnonymousVisitor ? 'anonymous' : 'registered';
  const isResolved =
    !isLoading && !isError && data !== undefined && !isAuthLoading;
  // A registered visitor gets nothing from the login page but a bounce back here.
  const offerSignIn = !isAuthLoading && isAnonymousVisitor;

  useWorkspaceTabReset(token);

  useEffect(() => {
    if (!isResolved || !permission || capturedTokenRef.current === token) {
      return;
    }
    capturedTokenRef.current = token;
    captureProductEvent('shared note viewed', {
      source: 'share_link',
      permission,
      actor_type: actorType,
    });
  }, [actorType, isResolved, permission, token]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message={t('shared.loadingSharedNote')} />
      </div>
    );
  }

  const isTerminalAccessError =
    ApiClientError.isApiClientError(error) &&
    TERMINAL_ACCESS_STATUSES.has(error.status);

  if (isError && (!data || isTerminalAccessError)) {
    return (
      <SharedNoteAccessError
        isNotFound={
          ApiClientError.isApiClientError(error) &&
          error.status === HTTP_NOT_FOUND
        }
        offerSignIn={offerSignIn}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!data) {
    return null;
  }

  const canEdit = data.accessLevel === PERMISSION.EDITOR;
  const displayContent = latestContent ?? data.content;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--background)">
      <SharedNoteHeader
        canEdit={canEdit}
        isEditing={isEditing}
        isPreparingEdit={isPreparingEdit}
        copied={copied}
        offerSignIn={offerSignIn}
        sharedPath={sharedPath}
        ownerName={data.owner.name}
        updatedAt={data.updatedAt}
        onCopyLink={copyLink}
        onStartEditing={handleStartEditing}
        onStopEditing={handleStopEditing}
      />

      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        {isError && (
          <div
            role="alert"
            className="mx-4 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm md:mx-8"
          >
            <span>{t('shared.failedToLoadShared')}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {tCommon('buttons.tryAgain')}
            </Button>
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-y-auto p-4 md:px-8 md:pt-3 md:pb-8">
          <div className="mx-auto max-w-4xl">
            {hasArtifacts && (
              <WorkspaceTabBar studyCount={sharedArtifacts.length} />
            )}

            <WorkspaceTabPanel tab="note" tabbed={hasArtifacts}>
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
                <ReadOnlyEditor content={displayContent} />
              )}
            </WorkspaceTabPanel>

            {hasArtifacts && (
              <WorkspaceTabPanel tab="estudio" tabbed>
                <StudyToolsTab
                  noteId={data.id}
                  artifacts={sharedArtifacts}
                  readOnly
                />
              </WorkspaceTabPanel>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
