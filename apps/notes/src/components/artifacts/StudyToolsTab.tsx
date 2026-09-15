import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft } from 'lucide-react';

import { useArtifacts } from '@knowtis/data-access-artifacts';
import { Button } from '@knowtis/design-system';
import type { Artifact } from '@knowtis/shared-types';

import { ARTIFACT_ROW_ID_ATTRIBUTE } from './artifact-row';
import { ArtifactGeneratorButton } from './ArtifactGenerator';
import { ArtifactList } from './ArtifactList';
import { ArtifactViewer } from './ArtifactViewer';
import { isFocusArtifact, StudyFocusSession } from './focus/StudyFocusSession';

interface SelectionProps {
  selectedArtifactId: string | null;
  onSelectArtifact: (id: string | null) => void;
}

type StudyToolsTabProps = SelectionProps &
  (
    | { noteId: string | null; artifacts?: never; readOnly?: never }
    | { noteId: string; artifacts: Artifact[]; readOnly: true }
  );

export function StudyToolsTab(props: StudyToolsTabProps) {
  const { noteId, selectedArtifactId, onSelectArtifact } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const previousSelectionRef = useRef(selectedArtifactId);
  useEffect(() => {
    const previous = previousSelectionRef.current;
    previousSelectionRef.current = selectedArtifactId;
    if (!previous || selectedArtifactId !== null) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(
        `button[${ARTIFACT_ROW_ID_ATTRIBUTE}]`
      );
      Array.from(buttons ?? [])
        .find(
          (button) =>
            button.getAttribute(ARTIFACT_ROW_ID_ATTRIBUTE) === previous
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedArtifactId]);
  const readOnly = 'artifacts' in props;
  const { t } = useTranslation('notes');
  const { data: fetchedArtifacts } = useArtifacts(
    readOnly || !noteId ? undefined : noteId
  );
  const artifacts: Artifact[] | undefined =
    'artifacts' in props ? props.artifacts : fetchedArtifacts;
  const selected =
    selectedArtifactId === null
      ? null
      : (artifacts?.find((artifact) => artifact.id === selectedArtifactId) ??
        null);

  if (!noteId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {t('ai.copilot.study.noNote')}
      </div>
    );
  }

  const handleSelect = (artifact: Artifact) => onSelectArtifact(artifact.id);

  const list = (
    <div ref={listRef} className="p-3 space-y-4">
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
          onSelect={handleSelect}
        />
      ) : (
        <ArtifactList
          noteId={noteId}
          readOnly={false}
          onSelect={handleSelect}
        />
      )}
    </div>
  );

  if (!selected) {
    return list;
  }

  if (isFocusArtifact(selected)) {
    return (
      <>
        {list}
        <StudyFocusSession
          artifact={selected}
          readOnly={readOnly}
          onClose={() => onSelectArtifact(null)}
        />
      </>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12"
          onClick={() => onSelectArtifact(null)}
          aria-label={t('ai.artifacts.back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold text-foreground truncate flex-1">
          {selected.title}
        </h2>
      </div>
      <ArtifactViewer artifact={selected} />
    </div>
  );
}
