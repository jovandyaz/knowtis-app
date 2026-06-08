import { describe, expect, it } from 'vitest';

import { ProposedMutation } from './proposed-mutation';

describe('ProposedMutation', () => {
  it('creates a valid create proposal', () => {
    const result = ProposedMutation.create({
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'create',
      payload: { title: 'GTD', contentHtml: '<p>do</p>' },
      summary: 'Create note "GTD"',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.kind).toBe('create');
      expect(result.value.targetNoteId).toBeUndefined();
    }
  });

  it('requires targetNoteId for update/share', () => {
    const result = ProposedMutation.create({
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'update',
      payload: { title: 'x' },
      summary: 'Update',
    });
    expect(result.isErr()).toBe(true);
  });

  it('is immutable (frozen)', () => {
    const result = ProposedMutation.create({
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'share',
      targetNoteId: '22222222-2222-2222-2222-222222222222',
      payload: { targetEmail: 'a@b.com', permission: 'editor' },
      summary: 'Share',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });
});
