import { BookOpen, BrainCircuit, HelpCircle, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { ArtifactType } from '@knowtis/shared-types';

interface ArtifactDisplayConfig {
  icon: LucideIcon;
  labelKey: string;
}

export const ARTIFACT_DISPLAY: Record<ArtifactType, ArtifactDisplayConfig> = {
  flashcard_deck: { icon: Layers, labelKey: 'ai.artifacts.types.flashcards' },
  quiz: { icon: HelpCircle, labelKey: 'ai.artifacts.types.quiz' },
  summary: { icon: BookOpen, labelKey: 'ai.artifacts.types.summary' },
  mind_map: { icon: BrainCircuit, labelKey: 'ai.artifacts.types.mindMap' },
};
