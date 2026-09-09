import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft } from 'lucide-react';

import type { Artifact } from '@knowtis/shared-types';

import { ArtifactGeneratorButton } from './ArtifactGenerator';
import { ArtifactList } from './ArtifactList';
import { ArtifactViewer } from './ArtifactViewer';

type StudyToolsTabProps =
  | { noteId: string | null; artifacts?: never; readOnly?: never }
  | { noteId: string; artifacts: Artifact[]; readOnly: true };

export function StudyToolsTab(props: StudyToolsTabProps) {
  const { noteId } = props;
  const readOnly = 'artifacts' in props;
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
        {t('ai.copilot.study.noNote')}
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
            aria-label={t('ai.artifacts.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold text-foreground truncate flex-1">
            {selected.title}
          </h2>
        </div>
        <ArtifactViewer artifact={selected} readOnly={readOnly} />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {t('ai.artifacts.studyTools')}
        </h2>
        {!readOnly && <ArtifactGeneratorButton />}
      </div>
      {'artifacts' in props ? (
        <ArtifactList
          artifacts={props.artifacts}
          readOnly={true}
          onSelect={setSelected}
        />
      ) : (
        <ArtifactList noteId={noteId} readOnly={false} onSelect={setSelected} />
      )}
    </div>
  );
}
