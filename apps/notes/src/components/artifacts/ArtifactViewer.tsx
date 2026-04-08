import type { Artifact } from '@knowtis/shared-types';

import { FlashcardStudy } from './FlashcardStudy';
import { MindMapViewer } from './MindMapViewer';
import { QuizSession } from './QuizSession';
import { SummaryViewer } from './SummaryViewer';

interface ArtifactViewerProps {
  artifact: Artifact;
  readOnly?: boolean;
}

export function ArtifactViewer({ artifact, readOnly }: ArtifactViewerProps) {
  switch (artifact.type) {
    case 'flashcard_deck':
      return (
        <FlashcardStudy
          key={artifact.id}
          artifact={artifact}
          readOnly={readOnly}
        />
      );
    case 'quiz':
      return (
        <QuizSession
          key={artifact.id}
          artifact={artifact}
          readOnly={readOnly}
        />
      );
    case 'summary':
      return <SummaryViewer artifact={artifact} />;
    case 'mind_map':
      return <MindMapViewer artifact={artifact} />;
    default:
      return null;
  }
}
