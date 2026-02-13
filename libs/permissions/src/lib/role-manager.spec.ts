import { describe, expect, it } from 'vitest';

import type { Article, TestAbility } from './__tests__/fixtures';
import { RoleManager } from './role-manager';

describe('RoleManager', () => {
  it('should build ability from a single role', () => {
    const manager = new RoleManager<TestAbility>({
      resolveSubject: (obj) => obj.__typename,
    });

    manager.registerRole('viewer', (allow) => {
      allow('read', 'Article');
    });

    const ability = manager.buildForRoles(['viewer']);
    expect(ability.can('read', 'Article')).toBe(true);
    expect(ability.can('update', 'Article')).toBe(false);
  });

  it('should merge rules from multiple roles', () => {
    const manager = new RoleManager<TestAbility>({
      resolveSubject: (obj) => obj.__typename,
    });

    manager.registerRole('viewer', (allow) => {
      allow('read', 'Article');
    });

    manager.registerRole('editor', (allow) => {
      allow('update', 'Article');
    });

    const ability = manager.buildForRoles(['viewer', 'editor']);
    expect(ability.can('read', 'Article')).toBe(true);
    expect(ability.can('update', 'Article')).toBe(true);
    expect(ability.can('delete', 'Article')).toBe(false);
  });

  it('should throw for unknown role', () => {
    const manager = new RoleManager<TestAbility>();

    expect(() => manager.buildForRoles(['nonexistent'])).toThrow(
      'Unknown role: nonexistent'
    );
  });

  it('should support registering roles in constructor', () => {
    const manager = new RoleManager<TestAbility>({
      roles: {
        admin: (allow) => {
          allow('manage', 'all');
        },
        viewer: (allow) => {
          allow('read', 'Article');
        },
      },
    });

    const ability = manager.buildForRoles(['admin']);
    expect(ability.can('manage', 'all')).toBe(true);
  });

  it('should list registered roles', () => {
    const manager = new RoleManager<TestAbility>({
      roles: {
        admin: (allow) => {
          allow('manage', 'all');
        },
        viewer: (allow) => {
          allow('read', 'Article');
        },
      },
    });

    expect(manager.getRoleNames()).toEqual(['admin', 'viewer']);
  });

  it('should use resolveSubject when building abilities for roles', () => {
    const manager = new RoleManager<TestAbility>({
      resolveSubject: (obj) => obj.__typename,
    });

    manager.registerRole('author', (allow) => {
      allow('update', 'Article', { authorId: 'user-1' });
    });

    const ability = manager.buildForRoles(['author']);

    const ownArticle: Article = {
      __typename: 'Article',
      id: '1',
      authorId: 'user-1',
      published: false,
    };
    const otherArticle: Article = {
      __typename: 'Article',
      id: '2',
      authorId: 'user-2',
      published: false,
    };

    expect(ability.can('update', ownArticle)).toBe(true);
    expect(ability.can('update', otherArticle)).toBe(false);
  });

  it('should overwrite role when registering duplicate name', () => {
    const manager = new RoleManager<TestAbility>();

    manager.registerRole('viewer', (allow) => {
      allow('read', 'Article');
    });

    manager.registerRole('viewer', (allow) => {
      allow('update', 'Article');
    });

    const ability = manager.buildForRoles(['viewer']);
    expect(ability.can('update', 'Article')).toBe(true);
    expect(ability.can('read', 'Article')).toBe(false);
  });

  it('should return empty ability for empty roleNames array', () => {
    const manager = new RoleManager<TestAbility>({
      roles: {
        admin: (allow) => {
          allow('manage', 'all');
        },
      },
    });

    const ability = manager.buildForRoles([]);
    expect(ability.can('read', 'Article')).toBe(false);
  });
});
