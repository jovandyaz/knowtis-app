import { describe, expect, it } from 'vitest';

import { mindMapOutputSchema } from './artifact-output.schemas';

describe('mindMapOutputSchema (OpenAI strict structured outputs)', () => {
  it('rejects a node missing the children key (strict mode requires every property)', () => {
    expect(() =>
      mindMapOutputSchema.parse({ root: 'R', children: [{ label: 'leaf' }] })
    ).toThrow();
  });

  it('accepts both null and empty-array children as valid terminators', () => {
    const tree = {
      root: 'R',
      children: [
        { label: 'null-leaf', children: null },
        { label: 'empty-branch', children: [] },
      ],
    };
    expect(mindMapOutputSchema.parse(tree)).toEqual(tree);
  });

  it('recursively validates deeply nested nodes with multiple siblings', () => {
    const tree = {
      root: 'R',
      children: [
        {
          label: 'L1-a',
          children: [
            { label: 'L2-a', children: [{ label: 'L3-a', children: null }] },
            { label: 'L2-b', children: null },
          ],
        },
        { label: 'L1-b', children: null },
      ],
    };
    expect(mindMapOutputSchema.parse(tree)).toEqual(tree);
  });

  it('rejects a deeply nested node missing children', () => {
    expect(() =>
      mindMapOutputSchema.parse({
        root: 'R',
        children: [{ label: 'L1', children: [{ label: 'L2-no-children' }] }],
      })
    ).toThrow();
  });
});
