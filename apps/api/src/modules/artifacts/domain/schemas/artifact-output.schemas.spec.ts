import { describe, expect, it } from 'vitest';

import { mindMapOutputSchema } from './artifact-output.schemas';

describe('mindMapOutputSchema (OpenAI strict structured outputs)', () => {
  it('requires every node to carry an explicit children key (null for leaves)', () => {
    expect(() =>
      mindMapOutputSchema.parse({ root: 'R', children: [{ label: 'leaf' }] })
    ).toThrow();

    const tree = {
      root: 'R',
      children: [
        { label: 'branch', children: [{ label: 'leaf', children: null }] },
      ],
    };
    expect(mindMapOutputSchema.parse(tree)).toEqual(tree);
  });
});
