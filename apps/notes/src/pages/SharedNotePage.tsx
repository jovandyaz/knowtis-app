import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Link, useParams } from '@tanstack/react-router';

import { ensureGuestSession } from '@/auth/setup';
import { StudyToolsTab } from '@/components/artifacts/StudyToolsTab';
import { CollaborativeEditor } from '@/components/editor/CollaborativeEditor';
import { SharedNoteHeader } from '@/components/notes/shared-note/SharedNoteHeader';
import { WorkspaceTabBar } from '@/components/workspace/WorkspaceTabBar';
import { WorkspaceTabPanel } from '@/components/workspace/WorkspaceTabPanel';
import { ROUTES, sharedNotePath } from '@/config';
import { useCopyLink } from '@/hooks/useCopyLink';
import { captureProductEvent } from '@/lib/analytics/product-events';
import { useWorkspaceTabReset } from '@/stores/useWorkspaceTabReset';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { useAuthLoading, useAuthUser } from '@jovandyaz/auth-react';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import { useSharedNoteArtifacts } from '@knowtis/data-access-artifacts';
import { useNoteByToken } from '@knowtis/data-access-notes';
import { Button, ErrorState, LoadingState } from '@knowtis/design-system';
import { ReadOnlyEditor } from '@knowtis/editor';
import { PERMISSION } from '@knowtis/shared-types';

const HTTP_NOT_FOUND = 404;
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
  const [isEditing, setIsEditing] = useState(false);
  const [isPreparingEdit, setIsPreparingEdit] = useState(false);
  const [latestContent, setLatestContent] = useState<string | null>(null);
  const { copied, copy: copyLink } = useCopyLink();
  const sharedArtifacts = artifacts ?? [];
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

  const setWorkspaceTab = useWorkspaceStore((s) => s.setTab);

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

  const handleEditDenied = useCallback(() => {
    toast.error(t('shared.editDenied'));
  }, [t]);

  const handleStartEditing = useCallback(() => {
    setIsPreparingEdit(true);
    void ensureGuestSession()
      .then((ready) => {
        if (ready) {
          setWorkspaceTab('note');
          setIsEditing(true);
          return;
        }
        toast.error(t('shared.editUnavailable'));
      })
      .finally(() => setIsPreparingEdit(false));
  }, [t, setWorkspaceTab]);

  const handleUpdate = useCallback((content: string) => {
    setLatestContent(content);
  }, []);

  const handleStopEditing = useCallback(() => {
    setWorkspaceTab('note');
    setIsEditing(false);
  }, [setWorkspaceTab]);

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
    const isNotFound =
      ApiClientError.isApiClientError(error) && error.status === HTTP_NOT_FOUND;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
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
          {...(isNotFound
            ? {}
            : {
                onRetry: () => refetch(),
                retryLabel: tCommon('buttons.tryAgain'),
              })}
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          {offerSignIn ? (
            <Link to={ROUTES.LOGIN} search={{ redirect: undefined }}>
              <Button size="sm">{t('shared.signIn')}</Button>
            </Link>
          ) : null}
          <Link to={ROUTES.DASHBOARD}>
            <Button variant="outline" size="sm">
              {t('shared.goToKnowtis')}
            </Button>
          </Link>
        </div>
      </div>
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
