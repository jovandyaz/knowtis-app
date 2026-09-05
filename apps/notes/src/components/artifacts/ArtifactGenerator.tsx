import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { useWorkspaceStore } from '@/stores/workspace.store';
import type { TFunction } from 'i18next';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import {
  useArtifacts,
  useGenerateArtifact,
} from '@knowtis/data-access-artifacts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';
import type { ArtifactType } from '@knowtis/shared-types';

import { ARTIFACT_DISPLAY } from './artifact-display.config';

interface ArtifactOptionDisplay {
  type: ArtifactType;
  icon: React.ElementType;
  label: string;
  description: string;
}

const GENERATE_OPTION_KEYS: {
  type: ArtifactType;
  labelKey: string;
  descKey: string;
}[] = [
  {
    type: 'flashcard_deck',
    labelKey: 'ai.artifacts.generate.flashcards',
    descKey: 'ai.artifacts.generate.flashcardsDesc',
  },
  {
    type: 'quiz',
    labelKey: 'ai.artifacts.generate.quiz',
    descKey: 'ai.artifacts.generate.quizDesc',
  },
  {
    type: 'summary',
    labelKey: 'ai.artifacts.generate.summary',
    descKey: 'ai.artifacts.generate.summaryDesc',
  },
  {
    type: 'mind_map',
    labelKey: 'ai.artifacts.generate.mindMap',
    descKey: 'ai.artifacts.generate.mindMapDesc',
  },
];

function getArtifactOptions(t: TFunction<'notes'>): ArtifactOptionDisplay[] {
  return GENERATE_OPTION_KEYS.map(({ type, labelKey, descKey }) => ({
    type,
    icon: ARTIFACT_DISPLAY[type].icon,
    label: t(labelKey as never),
    description: t(descKey as never),
  }));
}

/**
 * Trigger button for the artifact generator dialog.
 */
export function ArtifactGeneratorButton() {
  const { t } = useTranslation('notes');
  const openGenerator = useArtifactSidebarStore((s) => s.openGenerator);

  return (
    <Button variant="outline" size="sm" onClick={openGenerator}>
      <Sparkles className="mr-1.5 h-4 w-4" />
      {t('ai.artifacts.generate.button')}
    </Button>
  );
}

interface ArtifactGeneratorDialogProps {
  noteId: string;
}

/**
 * Global dialog for generating study artifacts.
 */
export function ArtifactGeneratorDialog({
  noteId,
}: ArtifactGeneratorDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const open = useArtifactSidebarStore((s) => s.generatorOpen);
  const openGenerator = useArtifactSidebarStore((s) => s.openGenerator);
  const closeGenerator = useArtifactSidebarStore((s) => s.closeGenerator);
  const generateArtifact = useGenerateArtifact();

  const { data: existingArtifacts } = useArtifacts(noteId);
  const options = getArtifactOptions(t);

  const existingCounts = (existingArtifacts ?? []).reduce(
    (acc, a) => {
      acc[a.type] = (acc[a.type] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<ArtifactType, number>>
  );

  const handleGenerate = useCallback(
    (type: ArtifactType) => {
      // Generation runs for seconds, so the dialog is often gone before it
      // settles; per-call mutate callbacks are dropped once that happens.
      void generateArtifact
        .mutateAsync({ noteId, type })
        .then(() => {
          if (useArtifactSidebarStore.getState().activeNoteId === noteId) {
            closeGenerator();
            useWorkspaceStore.getState().setTab('estudio');
          }
          toast.success(t('ai.artifacts.generate.success'));
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : t('ai.artifacts.generate.error');
          toast.error(message);
        });
    },
    [noteId, generateArtifact, t, closeGenerator]
  );

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (value) {
        openGenerator();
      } else {
        closeGenerator();
      }
    },
    [openGenerator, closeGenerator]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        closeLabel={t('common:labels.closeDialog')}
      >
        <DialogHeader>
          <DialogTitle>{t('ai.artifacts.generate.title')}</DialogTitle>
          <DialogDescription>
            {t('ai.artifacts.generate.description')}
          </DialogDescription>
        </DialogHeader>

        {generateArtifact.isPending ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              {t('ai.artifacts.generate.generating')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {options.map(({ type, icon: Icon, label, description }) => {
              const count = existingCounts[type] ?? 0;
              return (
                <button
                  key={type}
                  type="button"
                  className="relative flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-muted"
                  onClick={() => handleGenerate(type)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  {count > 0 && (
                    <Badge
                      variant="secondary"
                      className="absolute right-2 top-2 text-[10px] px-1.5 py-0"
                    >
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
