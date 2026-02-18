import { describe, expect, it } from 'vitest';

import { definePermissions } from '../define-permissions';
import type { Article, TestAbility } from './fixtures';

describe('definePermissions', () => {
  it('should create an ability with allow rules', () => {
    const ability = definePermissions<TestAbility>((allow) => {
      allow('read', 'Article');
    });

    expect(ability.can('read', 'Article')).toBe(true);
    expect(ability.can('update', 'Article')).toBe(false);
  });

  it('should support forbid rules', () => {
    const ability = definePermissions<TestAbility>((allow, forbid) => {
      allow('manage', 'Article', { authorId: 'user-1' });
      forbid('delete', 'Article');
    });

    const article: Article = {
      __typename: 'Article',
      id: '1',
      authorId: 'user-1',
      published: false,
    };

    expect(ability.can('update', article)).toBe(true);
    expect(ability.can('delete', article)).toBe(false);
  });

  it('should enforce forbid rules taking precedence over allow', () => {
    const ability = definePermissions<TestAbility>((allow, forbid) => {
      allow('manage', 'all');
      forbid('delete', 'Article');
    });

    expect(ability.can('read', 'Article')).toBe(true);
    expect(ability.can('delete', 'Article')).toBe(false);
  });

  it('should work without resolveSubject for string subjects', () => {
    const ability = definePermissions<TestAbility>((allow) => {
      allow('read', 'Article');
    });

    expect(ability.can('read', 'Article')).toBe(true);
  });
});
