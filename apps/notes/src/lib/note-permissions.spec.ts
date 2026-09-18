import { describe, expect, it } from 'vitest';

import type { NoteAccessLevel, NoteAction } from './note-permissions';
import { ACCESS_BADGE_CONFIG, canPerformNoteAction } from './note-permissions';

describe('canPerformNoteAction', () => {
  it.each<[NoteAction]>([['read'], ['update'], ['delete'], ['share']])(
    'owner can %s',
    (action) => {
      expect(canPerformNoteAction('owner', action)).toBe(true);
    }
  );

  it.each<[NoteAction, boolean]>([
    ['read', true],
    ['update', true],
    ['delete', false],
    ['share', false],
  ])('editor can %s: %s', (action, expected) => {
    expect(canPerformNoteAction('editor', action)).toBe(expected);
  });

  it.each<[NoteAction, boolean]>([
    ['read', true],
    ['update', false],
    ['delete', false],
    ['share', false],
  ])('viewer can %s: %s', (action, expected) => {
    expect(canPerformNoteAction('viewer', action)).toBe(expected);
  });

  it('returns false for unknown access level', () => {
    expect(canPerformNoteAction('unknown' as NoteAccessLevel, 'read')).toBe(
      false
    );
  });
});

describe('ACCESS_BADGE_CONFIG', () => {
  it.each<[NoteAccessLevel, string]>([
    ['owner', 'share.owner'],
    ['editor', 'share.editor'],
    ['viewer', 'share.viewer'],
  ])('points %s at the shared notes translation key', (level, labelKey) => {
    expect(ACCESS_BADGE_CONFIG[level].labelKey).toBe(labelKey);
  });

  it('keeps the badge variants each surface already styles', () => {
    expect(ACCESS_BADGE_CONFIG.owner.variant).toBe('default');
    expect(ACCESS_BADGE_CONFIG.editor.variant).toBe('secondary');
    expect(ACCESS_BADGE_CONFIG.viewer.variant).toBe('outline');
  });
});
