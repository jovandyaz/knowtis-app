import type {
  Artifact,
  FlashcardArtifact,
  QuizArtifact,
} from '@knowtis/shared-types';

import { FlashcardStudy } from '../FlashcardStudy';
import { QuizSession } from '../QuizSession';

interface StudyFocusSessionProps {
  artifact: FlashcardArtifact | QuizArtifact;
  readOnly?: boolean | undefined;
  onClose: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components -- The guard decides which artifacts this session owns.
export function isFocusArtifact(
  artifact: Artifact
): artifact is FlashcardArtifact | QuizArtifact {
  return artifact.type === 'flashcard_deck' || artifact.type === 'quiz';
}

export function StudyFocusSession({
  artifact,
  readOnly,
  onClose,
}: StudyFocusSessionProps) {
  if (artifact.type === 'flashcard_deck') {
    return (
      <FlashcardStudy
        key={artifact.id}
        artifact={artifact}
        readOnly={readOnly}
        onClose={onClose}
      />
    );
  }
  return (
    <QuizSession
      key={artifact.id}
      artifact={artifact}
      readOnly={readOnly}
      onClose={onClose}
    />
  );
}
