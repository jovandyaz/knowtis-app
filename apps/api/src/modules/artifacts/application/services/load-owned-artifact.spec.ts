import { describe, expect, it, vi } from 'vitest';

import { ARTIFACT_TYPE } from '@knowtis/shared-types';

import { ArtifactErrorCodes } from '../../domain/errors/artifact.errors';
import type {
  ArtifactEntity,
  ArtifactReadRepository,
} from '../../domain/ports/artifact.repository';
import { loadOwnedArtifact } from './load-owned-artifact';

const USER_ID = 'user-1';
const ARTIFACT_ID = 'artifact-1';

const quiz: ArtifactEntity = {
  id: ARTIFACT_ID,
  type: ARTIFACT_TYPE.QUIZ,
  userId: USER_ID,
  sourceNoteId: 'note-1',
  title: 'Quiz: Test',
  content: { questions: [] },
  createdAt: new Date(),
  updatedAt: new Date(),
};

function repoReturning(
  artifact: ArtifactEntity | null
): ArtifactReadRepository {
  return {
    findById: vi.fn().mockResolvedValue(artifact),
  } as unknown as ArtifactReadRepository;
}

describe('loadOwnedArtifact', () => {
  it('returns the artifact when the caller owns it and the type matches', async () => {
    const result = await loadOwnedArtifact(
      repoReturning(quiz),
      ARTIFACT_ID,
      USER_ID,
      ARTIFACT_TYPE.QUIZ
    );

    expect(result._unsafeUnwrap()).toBe(quiz);
  });

  it('reports not found when the artifact does not exist', async () => {
    const result = await loadOwnedArtifact(
      repoReturning(null),
      ARTIFACT_ID,
      USER_ID,
      ARTIFACT_TYPE.QUIZ
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.ARTIFACT_NOT_FOUND,
      message: `Artifact not found: ${ARTIFACT_ID}`,
    });
  });

  it('reports not found — never permission denied — when another user owns it', async () => {
    const result = await loadOwnedArtifact(
      repoReturning({ ...quiz, userId: 'someone-else' }),
      ARTIFACT_ID,
      USER_ID,
      ARTIFACT_TYPE.QUIZ
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.ARTIFACT_NOT_FOUND,
      message: `Artifact not found: ${ARTIFACT_ID}`,
    });
  });

  it('reports the invalid type when the artifact is of another kind', async () => {
    const result = await loadOwnedArtifact(
      repoReturning({ ...quiz, type: ARTIFACT_TYPE.FLASHCARD_DECK }),
      ARTIFACT_ID,
      USER_ID,
      ARTIFACT_TYPE.QUIZ
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.INVALID_ARTIFACT_TYPE,
      message: `Invalid artifact type: ${ARTIFACT_TYPE.FLASHCARD_DECK}`,
    });
  });
});
