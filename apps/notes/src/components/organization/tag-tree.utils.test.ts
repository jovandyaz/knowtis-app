import { describe, expect, it } from 'vitest';

import type { TagNode } from '@knowtis/shared-types';

import { buildTagTree } from './tag-tree.utils';

const node = (path: string, noteCount = 0): TagNode => ({
  id: `id-${path}`,
  path,
  color: null,
  noteCount,
});

describe('buildTagTree', () => {
  it('should nest a branch under its parent', () => {
    const tree = buildTagTree([node('work'), node('work/alpha')]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.path).toBe('work');
    expect(tree[0]?.children.map((child) => child.path)).toEqual([
      'work/alpha',
    ]);
  });

  it('should label a node with its last segment only', () => {
    const tree = buildTagTree([node('work'), node('work/projects/alpha')]);

    expect(tree[0]?.label).toBe('work');
    expect(buildTagTree([node('work/projects/alpha')])[0]?.label).toBe('alpha');
  });

  it('should keep an orphan whose parent row is missing', () => {
    const tree = buildTagTree([node('work/alpha')]);

    expect(tree.map((item) => item.path)).toEqual(['work/alpha']);
    expect(tree[0]?.depth).toBe(1);
  });

  it('should order siblings by path regardless of input order', () => {
    const tree = buildTagTree([node('b'), node('a'), node('a/z'), node('a/y')]);

    expect(tree.map((item) => item.path)).toEqual(['a', 'b']);
    expect(tree[0]?.children.map((child) => child.path)).toEqual([
      'a/y',
      'a/z',
    ]);
  });

  it('should carry the server note count through untouched', () => {
    const tree = buildTagTree([node('work', 7)]);

    expect(tree[0]?.noteCount).toBe(7);
  });
});
