export const ARTIFACT_TYPE = {
  FLASHCARD_DECK: 'flashcard_deck',
  QUIZ: 'quiz',
  SUMMARY: 'summary',
  MIND_MAP: 'mind_map',
  OUTLINE: 'outline',
} as const;

export const ARTIFACT_TYPES = Object.values(ARTIFACT_TYPE);
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface FlashcardContent {
  cards: {
    front: string;
    back: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }[];
}

export interface QuizContent {
  questions: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }[];
}

export interface SummaryContent {
  summary: string;
  keyPoints: string[];
}

export interface MindMapNode {
  label: string;
  children?: MindMapNode[];
}

export interface MindMapContent {
  root: string;
  children: MindMapNode[];
}

export interface OutlineContent {
  outline: string;
}

export type ArtifactContent =
  | FlashcardContent
  | QuizContent
  | SummaryContent
  | MindMapContent
  | OutlineContent;

export interface Artifact {
  id: string;
  type: ArtifactType;
  userId: string;
  sourceNoteId: string;
  title: string;
  content: ArtifactContent;
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardProgress {
  artifactId: string;
  cardIndex: number;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReview: string;
}

export interface QuizAttempt {
  id: string;
  artifactId: string;
  score: number;
  answers: { questionIndex: number; selectedIndex: number; correct: boolean }[];
  completedAt: string;
}

export interface StudyStats {
  cardsDueToday: number;
  cardsReviewedToday: number;
  currentStreak: number;
  totalCardsStudied: number;
}
