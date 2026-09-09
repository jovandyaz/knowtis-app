import { useTranslation } from 'react-i18next';

import { Clock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  useArtifacts,
  useDeleteArtifact,
} from '@knowtis/data-access-artifacts';
import {
  Badge,
  Button,
  EmptyState,
  LoadingState,
} from '@knowtis/design-system';
import type { Artifact } from '@knowtis/shared-types';

import { ARTIFACT_DISPLAY } from './artifact-display.config';

const ROW_CLASSES =
  'group flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-3 transition-all hover:border-primary/30 hover:bg-muted/50';

const ROW_ACTION_CLASSES =
  'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface ArtifactListProps {
  noteId?: string;
  artifacts?: Artifact[];
  readOnly?: boolean;
  onSelect: (artifact: Artifact) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function ArtifactList({
  noteId,
  artifacts: externalArtifacts,
  readOnly,
  onSelect,
}: ArtifactListProps) {
  const { t } = useTranslation('notes');
  const { data: fetchedArtifacts, isLoading } = useArtifacts(
    externalArtifacts ? undefined : noteId
  );
  const deleteArtifact = useDeleteArtifact();
  const artifacts = externalArtifacts ?? fetchedArtifacts;

  const handleDelete = (artifactId: string) => {
    void deleteArtifact
      .mutateAsync(artifactId)
      .then(() => {
        toast.success(t('ai.artifacts.list.deleted'));
      })
      .catch(() => {
        toast.error(t('ai.artifacts.list.deleteError'));
      });
  };

  if (isLoading) {
    return <LoadingState message={t('ai.artifacts.list.loading')} />;
  }

  if (!artifacts || artifacts.length === 0) {
    return (
      <EmptyState
        title={t('ai.artifacts.list.emptyTitle')}
        description={t('ai.artifacts.list.emptyDescription')}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {artifacts.map((artifact: Artifact) => {
        const { icon: Icon, labelKey } = ARTIFACT_DISPLAY[artifact.type];

        return (
          <li key={artifact.id} className={ROW_CLASSES}>
            <button
              type="button"
              className={ROW_ACTION_CLASSES}
              onClick={() => onSelect(artifact)}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 block text-sm font-medium text-foreground">
                  {artifact.title}
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="px-1.5 py-0 text-[10px]"
                  >
                    {t(labelKey as never)}
                  </Badge>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDate(artifact.createdAt)}
                  </span>
                </span>
              </span>
            </button>
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 transition-opacity text-muted-foreground group-hover:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleDelete(artifact.id)}
                disabled={deleteArtifact.isPending}
                aria-label={t('ai.artifacts.list.deleteAriaLabel', {
                  title: artifact.title,
                })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
