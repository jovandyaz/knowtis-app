import type { MindMapArtifact, SummaryArtifact } from '@knowtis/shared-types';

import { MindMapViewer } from './MindMapViewer';
import { SummaryViewer } from './SummaryViewer';

interface ArtifactViewerProps {
  artifact: SummaryArtifact | MindMapArtifact;
}

export function ArtifactViewer({ artifact }: ArtifactViewerProps) {
  const { type, id } = artifact;
  switch (type) {
    case 'summary':
      return <SummaryViewer artifact={artifact} />;
    case 'mind_map':
      return <MindMapViewer artifact={artifact} />;
    default: {
      const unhandled: never = type;
      throw new Error(`Unhandled artifact: ${unhandled} (${id})`);
    }
  }
}
