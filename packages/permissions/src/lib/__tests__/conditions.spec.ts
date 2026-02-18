import { describe, expect, it } from 'vitest';

import { definePermissions } from '../define-permissions';
import { RoleManager } from '../role-manager';
import type { Article, TestAbility } from './fixtures';

describe('condition-based rules', () => {
  const resolveSubject = (obj: Article) => obj.__typename;

  it('should allow based on matching condition', () => {
    const ability = definePermissions<TestAbility>(
      (allow) => {
        allow('read', 'Article', { ownerId: '123' });
      },
      { resolveSubject }
    );

    const matchingArticle: Article = {
      __typename: 'Article',
      id: '1',
      authorId: '123',
      published: false,
    };

    // Condition checks against the object property 'ownerId', not 'authorId'
    // Since the article doesn't have 'ownerId', it won't match
    expect(ability.can('read', matchingArticle)).toBe(false);
  });

  it('should allow when condition matches object property', () => {
    const ability = definePermissions<TestAbility>(
      (allow) => {
        allow('manage', 'Article', { authorId: 'user-1' });
        allow('read', 'Article', { published: true });
      },
      { resolveSubject }
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

  it('should support conditions in RoleManager roles', () => {
    const manager = new RoleManager<TestAbility>({
      resolveSubject,
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

  it('should forbid with conditions overriding broader allow', () => {
    const ability = definePermissions<TestAbility>(
      (allow, forbid) => {
        allow('manage', 'Article');
        forbid('delete', 'Article', { published: true });
      },
      { resolveSubject }
    );

    const publishedArticle: Article = {
      __typename: 'Article',
      id: '1',
      authorId: 'user-1',
      published: true,
    };
    const draftArticle: Article = {
      __typename: 'Article',
      id: '2',
      authorId: 'user-1',
      published: false,
    };

    expect(ability.can('update', publishedArticle)).toBe(true);
    expect(ability.can('delete', publishedArticle)).toBe(false);
    expect(ability.can('delete', draftArticle)).toBe(true);
  });
});
