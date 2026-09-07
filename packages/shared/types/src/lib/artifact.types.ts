import type { ParaBucket } from './organization.types';

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
  children?: MindMapNode[] | null;
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

export const QUIZ_ATTEMPT_SCOPES = ['full', 'missed'] as const;
export type QuizAttemptScope = (typeof QUIZ_ATTEMPT_SCOPES)[number];

export const QUIZ_ATTEMPT_SCOPE = {
  FULL: 'full',
  MISSED: 'missed',
} as const satisfies Record<string, QuizAttemptScope>;

export interface QuizAttempt {
  id: string;
  artifactId: string;
  score: number;
  scope: QuizAttemptScope;
  answers: { questionIndex: number; selectedIndex: number; correct: boolean }[];
  completedAt: string;
}

export interface QuizQuestionReview {
  questionIndex: number;
  question: string;
  options: string[];
  selectedIndex: number;
  correctIndex: number;
  explanation: string;
}

export interface QuizAttemptReview {
  score: number;
  completedAt: string;
  review: QuizQuestionReview[];
  missedQuestionIndexes: number[];
}

export interface LatestQuizAttemptResponse {
  latest: QuizAttemptReview | null;
}

export const STUDY_CARD_KINDS = ['due', 'new'] as const;
export type StudyCardKind = (typeof STUDY_CARD_KINDS)[number];

export const STUDY_CARD_KIND = {
  DUE: 'due',
  NEW: 'new',
} as const satisfies Record<string, StudyCardKind>;

/** Days until the next review for each rating, as the scheduler would compute them right now. */
export interface PredictedIntervals {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface StudyCard {
  artifactId: string;
  cardIndex: number;
  noteId: string;
  deckTitle: string;
  bucket: ParaBucket | null;
  front: string;
  back: string;
  difficulty: FlashcardDifficulty;
  kind: StudyCardKind;
  predictedIntervals: PredictedIntervals;
}

export interface StudyStats {
  dueCount: number;
  newCount: number;
  reviewedToday: number;
  currentStreak: number;
  totalCardsStudied: number;
  nextDueAt: string | null;
}

export interface StudySession {
  cards: StudyCard[];
  stats: StudyStats;
}

export interface FlashcardDeckStudyState {
  masteredCount: number;
  totalCount: number;
  dueCount: number;
}

export interface QuizStudyState {
  lastScore: number;
  lastAttemptAt: string;
}

export type ArtifactStudyState =
  | FlashcardDeckStudyState
  | QuizStudyState
  | null;

export type ArtifactWithStudyState = Artifact & {
  studyState: ArtifactStudyState;
};

export const CARD_SESSION_STATUSES = [
  'pending',
  'correct',
  'wrong',
  'skipped',
] as const;
export type CardSessionStatus = (typeof CARD_SESSION_STATUSES)[number];

export const CARD_STATUS = {
  PENDING: 'pending',
  CORRECT: 'correct',
  WRONG: 'wrong',
  SKIPPED: 'skipped',
} as const satisfies Record<string, CardSessionStatus>;

export const RESTART_FILTERS = ['all', 'missed', 'skipped'] as const;
export type RestartFilter = (typeof RESTART_FILTERS)[number];

export interface CardResult {
  cardIndex: number;
  status: CardSessionStatus;
  front: string;
  back: string;
}

export interface StudySessionResult {
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  durationMs: number;
  cardResults: CardResult[];
}
