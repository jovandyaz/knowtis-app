import { describe, expect, it } from 'vitest';

import { appRoleManager, ROLES } from './roles';
import type { NoteSubject } from './types';

describe('appRoleManager', () => {
  const publicNote: NoteSubject = {
    __typename: 'Note',
    id: 'note-2',
    ownerId: 'other-user',
    isPublic: true,
  };

  const privateNote: NoteSubject = {
    __typename: 'Note',
    id: 'note-3',
    ownerId: 'other-user',
    isPublic: false,
  };

  describe('ROLES constants', () => {
    it('exports role names', () => {
      expect(ROLES.ANONYMOUS).toBe('anonymous');
      expect(ROLES.USER).toBe('user');
      expect(ROLES.NOTE_OWNER).toBe('note:owner');
      expect(ROLES.NOTE_EDITOR).toBe('note:editor');
      expect(ROLES.NOTE_VIEWER).toBe('note:viewer');
    });
  });

  describe('anonymous role', () => {
    const ability = appRoleManager.buildForRoles([ROLES.ANONYMOUS]);

    it('can read public notes', () => {
      expect(ability.can('read', publicNote)).toBe(true);
    });

    it('cannot read private notes', () => {
      expect(ability.can('read', privateNote)).toBe(false);
    });

    it('cannot create notes', () => {
      expect(ability.can('create', 'Note')).toBe(false);
    });
  });

  describe('user role', () => {
    const ability = appRoleManager.buildForRoles([ROLES.USER]);

    it('can create notes', () => {
      expect(ability.can('create', 'Note')).toBe(true);
    });

    it('can read public notes', () => {
      expect(ability.can('read', publicNote)).toBe(true);
    });
  });

  describe('note:owner role', () => {
    it('builds without throwing', () => {
      expect(() =>
        appRoleManager.buildForRoles([ROLES.NOTE_OWNER])
      ).not.toThrow();
    });
  });

  describe('role composition', () => {
    const ability = appRoleManager.buildForRoles([ROLES.ANONYMOUS, ROLES.USER]);

    it('combines permissions from both roles', () => {
      expect(ability.can('create', 'Note')).toBe(true);
      expect(ability.can('read', publicNote)).toBe(true);
    });
  });

  describe('getRoleNames', () => {
    it('returns all registered role names', () => {
      const names = appRoleManager.getRoleNames();
      expect(names).toContain(ROLES.ANONYMOUS);
      expect(names).toContain(ROLES.USER);
      expect(names).toContain(ROLES.NOTE_OWNER);
      expect(names).toContain(ROLES.NOTE_EDITOR);
      expect(names).toContain(ROLES.NOTE_VIEWER);
    });
  });
});
