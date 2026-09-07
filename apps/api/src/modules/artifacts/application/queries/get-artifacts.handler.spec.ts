import { describe, expect, it, vi } from 'vitest';

import type {
  ArtifactEntity,
  ArtifactReadRepository,
  FlashcardProgressRepository,
  QuizAttemptRepository,
} from '../../domain/ports/artifact.repository';
import { GetArtifactsHandler } from './get-artifacts.handler';

const base = {
  userId: 'user-1',
  sourceNoteId: 'note-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const deck: ArtifactEntity = {
  ...base,
  id: 'deck-1',
  type: 'flashcard_deck',
  title: 'Flashcards: Test',
  content: {
    cards: Array.from({ length: 4 }, () => ({
      front: 'f',
      back: 'b',
      difficulty: 'easy' as const,
    })),
  },
};
const quiz: ArtifactEntity = {
  ...base,
  id: 'quiz-1',
  type: 'quiz',
  title: 'Quiz: Test',
  content: { questions: [] },
};
const summary: ArtifactEntity = {
  ...base,
  id: 'sum-1',
  type: 'summary',
  title: 'Resumen',
  content: { summary: '', keyPoints: [] },
};

describe('GetArtifactsHandler', () => {
  it('attaches study state per artifact kind with one grouped query per kind', async () => {
    const getDeckStudyStates = vi
      .fn()
      .mockResolvedValue([
        { artifactId: 'deck-1', masteredCount: 2, dueCount: 1 },
      ]);
    const findLatestFullByArtifacts = vi.fn().mockResolvedValue([
      {
        id: 'a',
        artifactId: 'quiz-1',
        score: 0.7,
        scope: 'full',
        answers: [],
        completedAt: '2026-09-05T00:00:00.000Z',
      },
    ]);
    const handler = new GetArtifactsHandler(
      {
        findByNoteId: vi.fn().mockResolvedValue([deck, quiz, summary]),
        findByUserId: vi.fn(),
      } as unknown as ArtifactReadRepository,
      { getDeckStudyStates } as unknown as FlashcardProgressRepository,
      { findLatestFullByArtifacts } as unknown as QuizAttemptRepository
    );

    const result = await handler.execute({
      userId: 'user-1',
      noteId: 'note-1',
    });
    const items = result._unsafeUnwrap();

    expect(getDeckStudyStates).toHaveBeenCalledTimes(1);
    expect(getDeckStudyStates).toHaveBeenCalledWith(['deck-1'], 'user-1');
    expect(findLatestFullByArtifacts).toHaveBeenCalledTimes(1);
    expect(findLatestFullByArtifacts).toHaveBeenCalledWith(
      ['quiz-1'],
      'user-1'
    );
    expect(items[0]?.studyState).toEqual({
      masteredCount: 2,
      totalCount: 4,
      dueCount: 1,
    });
    expect(items[1]?.studyState).toEqual({
      lastScore: 0.7,
      lastAttemptAt: '2026-09-05T00:00:00.000Z',
    });
    expect(items[2]?.studyState).toBeNull();
  });

  it('gives a never-studied deck zero counts and a never-attempted quiz null', async () => {
    const handler = new GetArtifactsHandler(
      {
        findByNoteId: vi.fn().mockResolvedValue([deck, quiz]),
        findByUserId: vi.fn(),
      } as unknown as ArtifactReadRepository,
      {
        getDeckStudyStates: vi.fn().mockResolvedValue([]),
      } as unknown as FlashcardProgressRepository,
      {
        findLatestFullByArtifacts: vi.fn().mockResolvedValue([]),
      } as unknown as QuizAttemptRepository
    );

    const items = (
      await handler.execute({ userId: 'user-1', noteId: 'note-1' })
    )._unsafeUnwrap();
    expect(items[0]?.studyState).toEqual({
      masteredCount: 0,
      totalCount: 4,
      dueCount: 0,
    });
    expect(items[1]?.studyState).toBeNull();
  });
});
