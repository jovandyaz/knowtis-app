import { describe, expect, it } from 'vitest';

import { defineAbilityFor } from './permissions';
import type { AuthUser, NoteSubject } from './types';

describe('defineAbilityFor', () => {
  const user: AuthUser = { id: 'user-1' };

  describe('note owner', () => {
    const note: NoteSubject = {
      __typename: 'Note',
      id: 'note-1',
      ownerId: 'user-1',
      isPublic: false,
    };
    const ability = defineAbilityFor(user);

    it('can read own note', () => {
      expect(ability.can('read', note)).toBe(true);
    });

    it('can update own note', () => {
      expect(ability.can('update', note)).toBe(true);
    });

    it('can delete own note', () => {
      expect(ability.can('delete', note)).toBe(true);
    });

    it('can share own note', () => {
      expect(ability.can('share', note)).toBe(true);
    });
  });

  describe('note editor', () => {
    const note: NoteSubject = {
      __typename: 'Note',
      id: 'note-2',
      ownerId: 'other-user',
      isPublic: false,
    };
    const ability = defineAbilityFor(user, {
      sharedNotes: [{ noteId: 'note-2', permission: 'editor' }],
    });

    it('can read shared note as editor', () => {
      expect(ability.can('read', note)).toBe(true);
    });

    it('can update shared note as editor', () => {
      expect(ability.can('update', note)).toBe(true);
    });

    it('cannot delete shared note as editor', () => {
      expect(ability.can('delete', note)).toBe(false);
    });

    it('cannot share shared note as editor', () => {
      expect(ability.can('share', note)).toBe(false);
    });
  });

  describe('note viewer', () => {
    const note: NoteSubject = {
      __typename: 'Note',
      id: 'note-3',
      ownerId: 'other-user',
      isPublic: false,
    };
    const ability = defineAbilityFor(user, {
      sharedNotes: [{ noteId: 'note-3', permission: 'viewer' }],
    });

    it('can read shared note as viewer', () => {
      expect(ability.can('read', note)).toBe(true);
    });

    it('cannot update shared note as viewer', () => {
      expect(ability.can('update', note)).toBe(false);
    });
  });

  describe('note creation', () => {
    it('owner can create notes (via manage)', () => {
      const ability = defineAbilityFor(user);
      const ownedNote: NoteSubject = {
        __typename: 'Note',
        id: 'note-1',
        ownerId: 'user-1',
        isPublic: false,
      };
      expect(ability.can('create', ownedNote)).toBe(true);
    });

    it('anonymous user cannot create notes', () => {
      const ability = defineAbilityFor(null);
      expect(ability.can('create', 'Note')).toBe(false);
    });
  });

  describe('public notes', () => {
    const publicNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-4',
      ownerId: 'other-user',
      isPublic: true,
    };

    it('anyone can read public notes', () => {
      const ability = defineAbilityFor(user);
      expect(ability.can('read', publicNote)).toBe(true);
    });

    it('non-owner cannot update public note without permission', () => {
      const ability = defineAbilityFor(user);
      expect(ability.can('update', publicNote)).toBe(false);
    });
  });

  describe('no access', () => {
    const privateNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-5',
      ownerId: 'other-user',
      isPublic: false,
    };

    it('cannot read private note without permission', () => {
      const ability = defineAbilityFor(user);
      expect(ability.can('read', privateNote)).toBe(false);
    });

    it('denies access with empty sharedNotes array', () => {
      const ability = defineAbilityFor(user, { sharedNotes: [] });
      expect(ability.can('read', privateNote)).toBe(false);
    });
  });

  describe('link-based sharing', () => {
    const sharedNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-link-1',
      ownerId: 'other-user',
      isPublic: false,
    };

    describe('anonymous user with viewer link', () => {
      const ability = defineAbilityFor(null, {
        shareLinks: [{ noteId: 'note-link-1', permission: 'viewer' }],
      });

      it('can read note via share link', () => {
        expect(ability.can('read', sharedNote)).toBe(true);
      });

      it('cannot update note via viewer link', () => {
        expect(ability.can('update', sharedNote)).toBe(false);
      });

      it('cannot delete note via viewer link', () => {
        expect(ability.can('delete', sharedNote)).toBe(false);
      });
    });

    describe('anonymous user with editor link', () => {
      const ability = defineAbilityFor(null, {
        shareLinks: [{ noteId: 'note-link-1', permission: 'editor' }],
      });

      it('can read and update via editor link', () => {
        expect(ability.can('read', sharedNote)).toBe(true);
        expect(ability.can('update', sharedNote)).toBe(true);
      });

      it('cannot delete or share via editor link', () => {
        expect(ability.can('delete', sharedNote)).toBe(false);
        expect(ability.can('share', sharedNote)).toBe(false);
      });
    });

    describe('authenticated user with share link', () => {
      const ability = defineAbilityFor(user, {
        shareLinks: [{ noteId: 'note-link-1', permission: 'editor' }],
      });

      it('can read and update via link', () => {
        expect(ability.can('read', sharedNote)).toBe(true);
        expect(ability.can('update', sharedNote)).toBe(true);
      });
    });

    describe('no link', () => {
      const ability = defineAbilityFor(null, { shareLinks: [] });

      it('cannot access private note', () => {
        expect(ability.can('read', sharedNote)).toBe(false);
      });
    });
  });

  describe('anonymous user', () => {
    const publicNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-6',
      ownerId: 'other-user',
      isPublic: true,
    };

    const privateNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-7',
      ownerId: 'other-user',
      isPublic: false,
    };

    it('can read public notes', () => {
      const ability = defineAbilityFor(null);
      expect(ability.can('read', publicNote)).toBe(true);
    });

    it('cannot read private notes', () => {
      const ability = defineAbilityFor(null);
      expect(ability.can('read', privateNote)).toBe(false);
    });

    it('cannot update any note', () => {
      const ability = defineAbilityFor(null);
      expect(ability.can('update', publicNote)).toBe(false);
    });
  });
});
