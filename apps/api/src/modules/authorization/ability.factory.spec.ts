import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { NoteSubject } from '@knowtis/authorization';
import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

import { AppAbilityFactory } from './ability.factory';

describe('AppAbilityFactory', () => {
  let factory: AppAbilityFactory;
  const user = { id: 'user-1' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AppAbilityFactory],
    }).compile();

    factory = module.get(AppAbilityFactory);
  });

  it('should create ability for authenticated user', () => {
    const ability = factory.createAbility({ user });

    const ownedNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-1',
      ownerId: 'user-1',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    };
    expect(ability.can('update', ownedNote)).toBe(true);
  });

  it('should create ability with shared notes context', () => {
    const ability = factory.createAbility({
      user,
      permissionContext: {
        sharedNotes: [{ noteId: 'note-2', permission: PERMISSION.EDITOR }],
      },
    });

    const sharedNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-2',
      ownerId: 'other-user',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    };
    expect(ability.can('update', sharedNote)).toBe(true);
  });

  it('should create ability for anonymous user', () => {
    const ability = factory.createAbility({});
    const publicNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-1',
      ownerId: 'owner',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
    };

    expect(ability.can('read', publicNote)).toBe(true);
    expect(ability.can('update', publicNote)).toBe(false);
  });

  it('should handle explicit null user', () => {
    const ability = factory.createAbility({ user: null });
    const privateNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-1',
      ownerId: 'owner',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    };

    expect(ability.can('read', privateNote)).toBe(false);
  });

  it('should deny non-owner without shared permissions', () => {
    const ability = factory.createAbility({ user });
    const otherNote: NoteSubject = {
      __typename: 'Note',
      id: 'note-1',
      ownerId: 'other-user',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    };

    expect(ability.can('read', otherNote)).toBe(false);
    expect(ability.can('update', otherNote)).toBe(false);
  });
});
