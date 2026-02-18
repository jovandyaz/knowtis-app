import { describe, expect, it } from 'vitest';

import { RoleManager } from '../role-manager';
import type { TestAbility } from './fixtures';

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

  it('should support registerRole and getRoleNames', () => {
    const manager = new RoleManager<TestAbility>();

    manager.registerRole('admin', (allow) => {
      allow('manage', 'all');
    });
    manager.registerRole('viewer', (allow) => {
      allow('read', 'Article');
    });

    expect(manager.getRoleNames()).toEqual(['admin', 'viewer']);
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
    expect(manager.getRoleNames()).toEqual(['admin', 'viewer']);
  });

  it('should throw for unknown role', () => {
    const manager = new RoleManager<TestAbility>();

    expect(() => manager.buildForRoles(['nonexistent'])).toThrow(
      'Unknown role: nonexistent'
    );
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
