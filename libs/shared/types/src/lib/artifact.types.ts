export const ARTIFACT_TYPE = {
  FLASHCARD_DECK: 'flashcard_deck',
  QUIZ: 'quiz',
  SUMMARY: 'summary',
  MIND_MAP: 'mind_map',
} as const;

export const ARTIFACT_TYPES = Object.values(ARTIFACT_TYPE);
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const FLASHCARD_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type FlashcardDifficulty = (typeof FLASHCARD_DIFFICULTIES)[number];

export interface FlashcardContent {
  cards: {
    front: string;
    back: string;
    difficulty: FlashcardDifficulty;
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

export type ArtifactContent =
  | FlashcardContent
  | QuizContent
  | SummaryContent
  | MindMapContent;

interface ArtifactBase {
  id: string;
  userId: string;
  sourceNoteId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type Artifact =
  | (ArtifactBase & { type: 'flashcard_deck'; content: FlashcardContent })
  | (ArtifactBase & { type: 'quiz'; content: QuizContent })
  | (ArtifactBase & { type: 'summary'; content: SummaryContent })
  | (ArtifactBase & { type: 'mind_map'; content: MindMapContent });

export type FlashcardArtifact = Extract<Artifact, { type: 'flashcard_deck' }>;
export type QuizArtifact = Extract<Artifact, { type: 'quiz' }>;
export type SummaryArtifact = Extract<Artifact, { type: 'summary' }>;
export type MindMapArtifact = Extract<Artifact, { type: 'mind_map' }>;

/** SM-2 spaced repetition quality ratings (0–5 scale) */
export const SM2_QUALITY = {
  AGAIN: 0,
  HARD: 2,
  GOOD: 3,
  EASY: 5,
} as const;

export type SM2Quality = (typeof SM2_QUALITY)[keyof typeof SM2_QUALITY];

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
