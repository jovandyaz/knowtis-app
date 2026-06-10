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
      expect(result.value).not.toHaveProperty('targetNoteId');
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

  it('rejects an empty or whitespace-only summary', () => {
    for (const summary of ['', '   ']) {
      const result = ProposedMutation.create({
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'create',
        payload: { title: 'x', contentHtml: '<p>x</p>' },
        summary,
      });
      expect(result.isErr()).toBe(true);
    }
  });

  it('creates a valid share proposal with a targetNoteId', () => {
    const result = ProposedMutation.create({
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'share',
      targetNoteId: '22222222-2222-2222-2222-222222222222',
      payload: { targetEmail: 'user@example.com', permission: 'viewer' },
      summary: 'Share with user',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.kind === 'share') {
      expect(result.value.targetNoteId).toBe(
        '22222222-2222-2222-2222-222222222222'
      );
    } else {
      throw new Error('expected a share proposal');
    }
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
