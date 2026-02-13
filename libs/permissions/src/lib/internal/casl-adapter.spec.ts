import { describe, expect, it } from 'vitest';

import type { Article, TestAction, TestSubject } from '../__tests__/fixtures';
import { buildAbility } from './casl-adapter';

describe('buildAbility (internal CASL adapter)', () => {
  it('should create ability from allow rules', () => {
    const ability = buildAbility<TestAction, TestSubject>((allow) => {
      allow('read', 'Article');
    });

    expect(ability.can('read', 'Article')).toBe(true);
    expect(ability.can('update', 'Article')).toBe(false);
  });

  it('should support forbid rules', () => {
    const ability = buildAbility<TestAction, TestSubject>((allow, forbid) => {
      allow('manage', 'all');
      forbid('delete', 'Article');
    });

    expect(ability.can('read', 'Article')).toBe(true);
    expect(ability.can('delete', 'Article')).toBe(false);
  });

  it('should support condition-based rules with resolveSubject', () => {
    const ability = buildAbility<TestAction, TestSubject>(
      (allow) => {
        allow('manage', 'Article', { authorId: 'user-1' });
        allow('read', 'Article', { published: true });
      },
      { resolveSubject: (obj) => obj.__typename }
    );

    const ownArticle: Article = {
      __typename: 'Article',
      id: '1',
      authorId: 'user-1',
      published: false,
    };
    const publicArticle: Article = {
      __typename: 'Article',
      id: '2',
      authorId: 'user-2',
      published: true,
    };
    const privateArticle: Article = {
      __typename: 'Article',
      id: '3',
      authorId: 'user-2',
      published: false,
    };

    expect(ability.can('update', ownArticle)).toBe(true);
    expect(ability.can('read', publicArticle)).toBe(true);
    expect(ability.can('update', publicArticle)).toBe(false);
    expect(ability.can('read', privateArticle)).toBe(false);
  });

  it('should support array of actions', () => {
    const ability = buildAbility<TestAction, TestSubject>((allow) => {
      allow(['read', 'update'], 'Article');
    });

    expect(ability.can('read', 'Article')).toBe(true);
    expect(ability.can('update', 'Article')).toBe(true);
    expect(ability.can('delete', 'Article')).toBe(false);
  });

  it('should work without options for string-only subjects', () => {
    const ability = buildAbility<TestAction, TestSubject>((allow) => {
      allow('read', 'Article');
    });

    expect(ability.can('read', 'Article')).toBe(true);
  });

  it('should return false for everything when no rules defined', () => {
    const ability = buildAbility<TestAction, TestSubject>(() => {});

    expect(ability.can('read', 'Article')).toBe(false);
    expect(ability.cannot('read', 'Article')).toBe(true);
  });
});
