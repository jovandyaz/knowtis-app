import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft } from 'lucide-react';

import type { Artifact } from '@knowtis/shared-types';

import { ArtifactGeneratorButton } from '../artifacts/ArtifactGenerator';
import { ArtifactList } from '../artifacts/ArtifactList';
import { ArtifactViewer } from '../artifacts/ArtifactViewer';

export function StudyToolsTab({ noteId }: { noteId: string | null }) {
  const { t } = useTranslation('notes');
  const [selected, setSelected] = useState<Artifact | null>(null);
  const [prevNoteId, setPrevNoteId] = useState(noteId);

  if (noteId !== prevNoteId) {
    setPrevNoteId(noteId);
    setSelected(null);
  }

  if (!noteId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {t('ai.copilot.estudio.noNote')}
      </div>
    );
  }

  if (selected) {
    return (
      <div className="p-3 space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('ai.artifacts.sidebar.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold text-foreground truncate flex-1">
            {selected.title}
          </h2>
        </div>
        <ArtifactViewer artifact={selected} />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {t('ai.artifacts.studyTools')}
        </h2>
        <ArtifactGeneratorButton />
      </div>
      <ArtifactList noteId={noteId} onSelect={setSelected} />
    </div>
  );
}
