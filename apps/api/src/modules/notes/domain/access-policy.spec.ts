import { describe, expect, it } from 'vitest';

import {
  canManagePeople,
  isEligibleRecipient,
  isPermissionWidening,
  resolveEffectiveAccess,
  type AccessSnapshot,
} from './access-policy';

const snapshot: AccessSnapshot = {
  ownerId: 'owner',
  generalAccess: 'anyone_with_link',
  generalAccessPermission: 'editor',
  shareTokenFingerprint: 'current',
  directPermissions: [
    { userId: 'reader', permission: 'viewer' },
    { userId: 'editor', permission: 'editor' },
  ],
};
describe('resolveEffectiveAccess', () => {
  it.each([
    ['owner', null, 'owner'],
    ['reader', null, 'viewer'],
    ['editor', null, 'editor'],
    ['guest', null, 'none'],
    ['guest', 'old', 'none'],
    ['guest', 'current', 'editor'],
    ['reader', 'current', 'editor'],
    ['reader', 'old', 'viewer'],
  ] as const)(
    '%s with token %s resolves %s',
    (userId, suppliedTokenFingerprint, expected) => {
      expect(
        resolveEffectiveAccess(snapshot, { userId, suppliedTokenFingerprint })
      ).toBe(expected);
    }
  );
  it('fails closed for absent or deleted notes', () =>
    expect(
      resolveEffectiveAccess(null, {
        userId: 'owner',
        suppliedTokenFingerprint: 'current',
      })
    ).toBe('none'));
  it('ignores a valid token when restricted', () =>
    expect(
      resolveEffectiveAccess(
        { ...snapshot, generalAccess: 'restricted' },
        { userId: 'guest', suppliedTokenFingerprint: 'current' }
      )
    ).toBe('none'));
  it('never downgrades direct editors through a viewer link', () =>
    expect(
      resolveEffectiveAccess(
        { ...snapshot, generalAccessPermission: 'viewer' },
        { userId: 'editor', suppliedTokenFingerprint: 'current' }
      )
    ).toBe('editor'));
});

describe('People management domain policy', () => {
  it.each([
    ['owner', false, null, true],
    ['owner', true, null, true],
    ['editor', true, 'editor', true],
    ['editor', false, 'editor', false],
    ['viewer', true, 'viewer', false],
    ['viewer', false, 'viewer', false],
    ['stranger', true, null, false],
    ['link-editor', true, null, false],
  ] as const)(
    '%s with sharing %s and direct %s manages People: %s',
    (actor, editorsCanShare, direct, expected) => {
      expect(
        canManagePeople({ ownerId: 'owner', editorsCanShare }, actor, direct)
      ).toBe(expected);
    }
  );

  it.each([
    [null, false],
    [{ id: 'recipient', isAnonymous: false }, true],
    [{ id: 'recipient', isAnonymous: true }, false],
    [{ id: 'owner', isAnonymous: false }, false],
    [{ id: 'actor', isAnonymous: false }, false],
  ] as const)('recipient %o is eligible: %s', (target, expected) => {
    expect(isEligibleRecipient(target, 'owner', 'actor')).toBe(expected);
  });

  it.each([
    [null, 'viewer', true],
    [null, 'editor', true],
    ['viewer', 'viewer', false],
    ['viewer', 'editor', true],
    ['editor', 'viewer', false],
    ['editor', 'editor', false],
  ] as const)('direct %s to %s widens: %s', (current, requested, expected) => {
    expect(isPermissionWidening(current, requested)).toBe(expected);
  });
});
