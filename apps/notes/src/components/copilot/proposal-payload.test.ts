import { describe, expect, it } from 'vitest';

import { readProposalPayload } from './proposal-payload';

describe('readProposalPayload', () => {
  it('keeps the string fields a proposal carries', () => {
    expect(
      readProposalPayload({
        title: 'Landing',
        contentHtml: '<p>hi</p>',
        targetEmail: 'ada@example.com',
        permission: 'editor',
      })
    ).toEqual({
      title: 'Landing',
      contentHtml: '<p>hi</p>',
      targetEmail: 'ada@example.com',
      permission: 'editor',
    });
  });

  it('drops fields the wire object sent as a non-string', () => {
    expect(
      readProposalPayload({ title: 42, contentHtml: null, targetEmail: {} })
    ).toEqual({
      title: undefined,
      contentHtml: undefined,
      targetEmail: undefined,
      permission: undefined,
    });
  });

  it('drops a permission outside the share vocabulary', () => {
    expect(readProposalPayload({ permission: 'owner' }).permission).toBe(
      undefined
    );
    expect(readProposalPayload({ permission: 'viewer' }).permission).toBe(
      'viewer'
    );
  });

  it('ignores the extra keys the server still sends', () => {
    expect(
      readProposalPayload({ summary: 'Create note', kind: 'create' })
    ).toEqual({
      title: undefined,
      contentHtml: undefined,
      targetEmail: undefined,
      permission: undefined,
    });
  });
});
