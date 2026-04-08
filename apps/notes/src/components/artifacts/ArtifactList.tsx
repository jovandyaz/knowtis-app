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

  const handleDelete = (e: React.MouseEvent, artifactId: string) => {
    e.stopPropagation();
    deleteArtifact.mutate(artifactId, {
      onSuccess: () => {
        toast.success(t('ai.artifacts.list.deleted'));
      },
      onError: () => {
        toast.error(t('ai.artifacts.list.deleteError'));
      },
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
    <div className="space-y-2">
      {artifacts.map((artifact: Artifact) => {
        const { icon: Icon, labelKey } = ARTIFACT_DISPLAY[artifact.type];

        return (
          <div
            key={artifact.id}
            className="group relative flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-3 cursor-pointer transition-all hover:border-primary/30 hover:bg-muted/50"
            onClick={() => onSelect(artifact)}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground line-clamp-1">
                {artifact.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {t(labelKey as never)}
                </Badge>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {formatDate(artifact.createdAt)}
                </span>
              </div>
            </div>
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => handleDelete(e, artifact.id)}
                disabled={deleteArtifact.isPending}
                aria-label={t('ai.artifacts.list.deleteAriaLabel', {
                  title: artifact.title,
                })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
