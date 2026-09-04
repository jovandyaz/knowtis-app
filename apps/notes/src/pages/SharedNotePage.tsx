import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Link, useParams } from '@tanstack/react-router';

import { ensureGuestSession } from '@/auth/setup';
import { SharedArtifactSidebar } from '@/components/artifacts/SharedArtifactSidebar';
import { CollaborativeEditor } from '@/components/editor/CollaborativeEditor';
import { KnowtisLogo } from '@/components/layout/KnowtisLogo';
import { ROUTES, sharedNotePath } from '@/config';
import { useCopyLink } from '@/hooks/useCopyLink';
import { captureProductEvent } from '@/lib/analytics/product-events';
import { useAuthLoading, useAuthUser } from '@jovandyaz/auth-react';
import { format } from 'date-fns';
import { Check, Eye, PanelLeft, Pencil, Share2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import { useSharedNoteArtifacts } from '@knowtis/data-access-artifacts';
import { useNoteByToken } from '@knowtis/data-access-notes';
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';
import { ReadOnlyEditor } from '@knowtis/editor';
import { PERMISSION } from '@knowtis/shared-types';

const HTTP_NOT_FOUND = 404;

export function SharedNotePage() {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const { token } = useParams({ from: '/s/$token' });
  const { data, isLoading, isError, error, refetch } = useNoteByToken(token);
  const user = useAuthUser();
  const isAuthLoading = useAuthLoading();
  const { data: artifacts } = useSharedNoteArtifacts(token);
  const [isEditing, setIsEditing] = useState(false);
  const [isPreparingEdit, setIsPreparingEdit] = useState(false);
  const [latestContent, setLatestContent] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { copied, copy: copyLink } = useCopyLink();
  const hasArtifacts = !!artifacts && artifacts.length > 0;
  const sharedPath = sharedNotePath(token);
  const capturedTokenRef = useRef<string | null>(null);
  const permission =
    data?.accessLevel === PERMISSION.VIEWER ||
    data?.accessLevel === PERMISSION.EDITOR
      ? data.accessLevel
      : undefined;
  const actorType = user?.isAnonymous === false ? 'registered' : 'anonymous';
  const isResolved =
    !isLoading && !isError && data !== undefined && !isAuthLoading;

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
    setIsEditing(false);
    toast.error(t('shared.editDenied'));
  }, [t]);

  const handleStartEditing = useCallback(() => {
    setIsPreparingEdit(true);
    void ensureGuestSession()
      .then((ready) => {
        if (ready) {
          setIsEditing(true);
          return;
        }
        toast.error(t('shared.editUnavailable'));
      })
      .finally(() => setIsPreparingEdit(false));
  }, [t]);

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
          <Link to={ROUTES.LOGIN} search={{ redirect: undefined }}>
            <Button size="sm">{t('shared.signIn')}</Button>
          </Link>
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
  const CopyIcon = copied ? Check : Share2;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--background)">
      {/* Mobile header */}
      <header className="md:hidden shrink-0 border-b border-border/30 bg-(--card)/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
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
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={copyLink}
              className="p-1.5 rounded-md text-(--muted-foreground) hover:text-(--foreground) transition-colors cursor-pointer"
              aria-label={tCommon('buttons.copyLink')}
            >
              <CopyIcon className="h-4 w-4" />
            </button>
            {canEdit && !isEditing && (
              <button
                type="button"
                onClick={handleStartEditing}
                disabled={isPreparingEdit}
                className="p-1.5 rounded-md text-(--muted-foreground) hover:text-(--foreground) transition-colors cursor-pointer disabled:opacity-50"
                aria-label={t('shared.editButton')}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {isEditing && (
              <button
                type="button"
                onClick={handleStopEditing}
                className="p-1.5 rounded-md text-(--muted-foreground) hover:text-(--foreground) transition-colors cursor-pointer"
                aria-label={t('shared.viewButton')}
              >
                <Eye className="h-4 w-4" />
              </button>
            )}
            <Link to={ROUTES.LOGIN} search={{ redirect: sharedPath }}>
              <Button variant="outline" size="sm">
                {t('shared.signIn')}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Desktop: content column + sidebar side-by-side */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="hidden md:flex items-center justify-between h-12 shrink-0 px-3">
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
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
                <span>{data.owner.name}</span>
                <span>&middot;</span>
                <span>{format(new Date(data.updatedAt), 'MMM d, yyyy')}</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-(--muted-foreground) hover:text-(--foreground)"
                    onClick={copyLink}
                  >
                    <CopyIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tCommon('buttons.copyLink')}</TooltipContent>
              </Tooltip>
              {canEdit && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-(--muted-foreground) hover:text-(--foreground)"
                      disabled={isPreparingEdit}
                      aria-label={
                        isEditing
                          ? t('shared.viewButton')
                          : t('shared.editButton')
                      }
                      onClick={
                        isEditing ? handleStopEditing : handleStartEditing
                      }
                    >
                      {isEditing ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isEditing
                      ? t('shared.viewButton')
                      : t('shared.editButton')}
                  </TooltipContent>
                </Tooltip>
              )}
              <Link to={ROUTES.LOGIN} search={{ redirect: sharedPath }}>
                <Button variant="outline" size="sm">
                  {t('shared.signIn')}
                </Button>
              </Link>
              {hasArtifacts && (
                <button
                  type="button"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                  className="p-1.5 rounded-md text-(--muted-foreground)/40 hover:text-(--muted-foreground) transition-colors cursor-pointer"
                  aria-label={t('ai.artifacts.sidebar.openPanel')}
                >
                  <PanelLeft className="h-4 w-4 -scale-x-100" />
                </button>
              )}
            </div>
          </div>

          <main className="flex-1 min-h-0 overflow-y-auto p-4 md:px-8 md:pt-3 md:pb-8">
            <div className="mx-auto max-w-4xl">
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
            </div>
          </main>
        </div>

        {hasArtifacts && (
          <SharedArtifactSidebar
            artifacts={artifacts}
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((prev) => !prev)}
          />
        )}
      </div>

      {hasArtifacts && (
        <button
          type="button"
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
          aria-label={t('ai.artifacts.sidebar.studyTools')}
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
