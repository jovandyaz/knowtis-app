import { describe, expect, it } from 'vitest';

import { TagPath } from './tag-path.vo';

describe('TagPath', () => {
  it.each([
    ['work', 'work'],
    ['work/projects/alpha', 'work/projects/alpha'],
    ['  Work/Alpha  ', 'work/alpha'],
    ['a-b/c-1', 'a-b/c-1'],
  ])('should normalize %j to %j', (raw, expected) => {
    const result = TagPath.create(raw);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['a/b/c/d/e', 'deeper than four segments'],
    ['work//alpha', 'an empty segment'],
    ['work/al pha', 'a space'],
    ['work/álpha', 'a non-ascii letter'],
    ['work/alpha!', 'punctuation'],
    ['work/' + 'a'.repeat(33), 'an over-long segment'],
    [
      'a'.repeat(30) + '/' + 'b'.repeat(30) + '/' + 'c'.repeat(70),
      'an over-long path',
    ],
  ])('should reject %j because of %s', (raw) => {
    expect(TagPath.create(raw).isErr()).toBe(true);
  });

  it('should accept exactly four segments', () => {
    expect(TagPath.create('a/b/c/d').isOk()).toBe(true);
  });

  it('should materialize every ancestor, shallowest first', () => {
    const path = TagPath.create('work/projects/alpha')._unsafeUnwrap();

    expect(path.withAncestors()).toEqual([
      'work',
      'work/projects',
      'work/projects/alpha',
    ]);
  });

  it('should report a root path as its own only ancestor', () => {
    const path = TagPath.create('work')._unsafeUnwrap();

    expect(path.withAncestors()).toEqual(['work']);
    expect(path.depth).toBe(1);
    expect(path.root).toBe('work');
  });

  it('should take the root from the first segment of a nested path', () => {
    expect(TagPath.create('work/alpha')._unsafeUnwrap().root).toBe('work');
  });
});
