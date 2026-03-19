import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { ArrowLeft, PanelLeft, Sparkles } from 'lucide-react';

import { useArtifacts } from '@knowtis/data-access-artifacts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';
import { useMediaQuery } from '@knowtis/shared-hooks';
import type { Artifact } from '@knowtis/shared-types';

import { ArtifactGenerator } from './ArtifactGenerator';
import { ArtifactList } from './ArtifactList';
import { ArtifactViewer } from './ArtifactViewer';

interface ArtifactSidebarProps {
  noteId: string;
}

function ArtifactPanelContent({
  noteId,
  onSelect,
}: {
  noteId: string;
  onSelect: (artifact: Artifact) => void;
}) {
  const { t } = useTranslation('notes');

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {t('ai.artifacts.studyTools')}
        </h2>
        <ArtifactGenerator
          noteId={noteId}
          onGenerated={(artifact) => onSelect(artifact)}
        />
      </div>
      <ArtifactList noteId={noteId} onSelect={onSelect} />
    </div>
  );
}

export function ArtifactSidebar({ noteId }: ArtifactSidebarProps) {
  const { t } = useTranslation('notes');
  const { data: artifacts } = useArtifacts(noteId);
  const open = useArtifactSidebarStore((s) => s.open);
  const setOpen = useArtifactSidebarStore((s) => s.setOpen);
  const autoShow = useArtifactSidebarStore((s) => s.autoShow);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
    null
  );

  useEffect(() => {
    if (artifacts && artifacts.length > 0) {
      autoShow();
    }
  }, [artifacts, autoShow]);

  if (!open) {
    return null;
  }

  if (isDesktop) {
    return (
      <aside className="w-80 shrink-0 border-l border-border bg-background overflow-y-auto">
        {selectedArtifact ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedArtifact(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t('ai.artifacts.sidebar.back')}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-sm font-semibold text-foreground truncate flex-1">
                {selectedArtifact.title}
              </h2>
            </div>
            <ArtifactViewer artifact={selectedArtifact} />
          </div>
        ) : (
          <ArtifactPanelContent
            noteId={noteId}
            onSelect={setSelectedArtifact}
          />
        )}
      </aside>
    );
  }

  return (
    <>
      <Dialog
        open={open && !selectedArtifact}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-full">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('ai.artifacts.studyTools')}</DialogTitle>
          </DialogHeader>
          <ArtifactPanelContent
            noteId={noteId}
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
              setOpen(false);
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto max-md:max-h-[95vh] max-md:min-h-[80vh]">
            <button
              type="button"
              onClick={() => setSelectedArtifact(null)}
              className="absolute left-4 top-4 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors z-10"
              aria-label={t('ai.artifacts.sidebar.back')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <DialogHeader>
              <DialogTitle>{selectedArtifact.title}</DialogTitle>
            </DialogHeader>
            <ArtifactViewer artifact={selectedArtifact} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function ArtifactSidebarToggle() {
  const { t } = useTranslation('notes');
  const open = useArtifactSidebarStore((s) => s.open);
  const toggle = useArtifactSidebarStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={toggle}
      className="p-1.5 rounded-md text-(--muted-foreground)/40 hover:text-(--muted-foreground) transition-colors cursor-pointer"
      aria-label={
        open
          ? t('ai.artifacts.sidebar.closePanel')
          : t('ai.artifacts.sidebar.openPanel')
      }
    >
      <PanelLeft className="h-4 w-4 -scale-x-100" />
    </button>
  );
}

export function ArtifactMobileFAB() {
  const { t } = useTranslation('notes');
  const toggle = useArtifactSidebarStore((s) => s.toggle);
  const activeNoteId = useArtifactSidebarStore((s) => s.activeNoteId);

  if (!activeNoteId) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
      aria-label={t('ai.artifacts.sidebar.studyTools')}
    >
      <Sparkles className="h-5 w-5" />
    </button>
  );
}
