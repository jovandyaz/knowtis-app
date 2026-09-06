import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft } from 'lucide-react';

import {
  Dialog,
  DIALOG_SIDE,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ResizablePanel,
} from '@knowtis/design-system';
import { useMediaQuery } from '@knowtis/shared-hooks';
import type { Artifact } from '@knowtis/shared-types';

import {
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './artifact-sidebar.constants';
import { ArtifactList } from './ArtifactList';
import { ArtifactViewer } from './ArtifactViewer';

interface SharedArtifactSidebarProps {
  artifacts: Artifact[];
  open: boolean;
  onToggle: () => void;
}

function SharedPanelContent({
  artifacts,
  onSelect,
}: {
  artifacts: Artifact[];
  onSelect: (artifact: Artifact) => void;
}) {
  const { t } = useTranslation('notes');

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-sm font-semibold text-foreground">
        {t('ai.artifacts.studyTools')}
      </h2>
      <ArtifactList artifacts={artifacts} readOnly onSelect={onSelect} />
    </div>
  );
}

export function SharedArtifactSidebar({
  artifacts,
  open,
  onToggle,
}: SharedArtifactSidebarProps) {
  const { t } = useTranslation(['notes', 'common']);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
    null
  );

  if (artifacts.length === 0) {
    return null;
  }

  if (isDesktop) {
    return (
      <ResizablePanel
        side={DIALOG_SIDE.RIGHT}
        defaultWidth={SIDEBAR_DEFAULT_WIDTH}
        minWidth={SIDEBAR_MIN_WIDTH}
        maxWidth={SIDEBAR_MAX_WIDTH}
        collapseThreshold={SIDEBAR_COLLAPSE_THRESHOLD}
        isOpen={open}
        onCollapse={onToggle}
        handleAriaLabel={t('ai.artifacts.sidebar.resizePanel', 'Resize panel')}
        className="border-l border-border bg-background"
      >
        <div className="h-full min-w-0 overflow-y-auto">
          {selectedArtifact ? (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedArtifact(null)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t('ai.artifacts.sidebar.back')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="flex-1 truncate text-sm font-semibold text-foreground">
                  {selectedArtifact.title}
                </h2>
              </div>
              <ArtifactViewer artifact={selectedArtifact} readOnly />
            </div>
          ) : (
            <SharedPanelContent
              artifacts={artifacts}
              onSelect={setSelectedArtifact}
            />
          )}
        </div>
      </ResizablePanel>
    );
  }

  if (!open) {
    return null;
  }

  return (
    <>
      <Dialog
        open={open && !selectedArtifact}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            onToggle();
          }
        }}
      >
        <DialogContent
          className="max-w-full"
          closeLabel={t('common:labels.closeDialog')}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t('ai.artifacts.studyTools')}</DialogTitle>
          </DialogHeader>
          <SharedPanelContent
            artifacts={artifacts}
            onSelect={setSelectedArtifact}
          />
        </DialogContent>
      </Dialog>

      {selectedArtifact && (
        <Dialog
          open={!!selectedArtifact}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setSelectedArtifact(null);
              onToggle();
            }
          }}
        >
          <DialogContent
            className="max-h-[80vh] max-w-2xl overflow-y-auto max-md:max-h-[95vh] max-md:min-h-[80vh]"
            closeLabel={t('common:labels.closeDialog')}
          >
            <button
              type="button"
              onClick={() => setSelectedArtifact(null)}
              className="absolute left-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t('ai.artifacts.sidebar.back')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <DialogHeader>
              <DialogTitle>{selectedArtifact.title}</DialogTitle>
            </DialogHeader>
            <ArtifactViewer artifact={selectedArtifact} readOnly />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
