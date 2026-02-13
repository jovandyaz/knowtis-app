import { describe, expect, it } from 'vitest';

import type { NoteAccessLevel, NoteAction } from './note-permissions';
import { canPerformNoteAction } from './note-permissions';

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
