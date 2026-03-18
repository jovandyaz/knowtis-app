import { describe, expect, it } from 'vitest';

import { ArtifactType } from './artifact-type.vo';

describe('ArtifactType', () => {
  it('should create a valid artifact type', () => {
    const result = ArtifactType.create('flashcard_deck');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toBe('flashcard_deck');
  });

  it('should reject invalid artifact type', () => {
    const result = ArtifactType.create('invalid_type');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('INVALID_ARTIFACT_TYPE');
  });

  it('should reject empty string', () => {
    const result = ArtifactType.create('');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('INVALID_ARTIFACT_TYPE');
  });

  it('should accept all valid types', () => {
    const validTypes = [
      'flashcard_deck',
      'quiz',
      'summary',
      'mind_map',
      'outline',
    ];
    for (const type of validTypes) {
      expect(ArtifactType.create(type).isOk()).toBe(true);
    }
  });

  it('should return primitive value', () => {
    const result = ArtifactType.create('quiz');
    expect(result._unsafeUnwrap().toPrimitive()).toBe('quiz');
  });
});
