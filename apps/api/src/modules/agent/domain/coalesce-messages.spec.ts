import { describe, expect, it } from 'vitest';

import { coalesceMessages } from './coalesce-messages';

describe('coalesceMessages', () => {
  it('leaves an already-alternating sequence unchanged', () => {
    const input = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'hello' },
    ];
    expect(coalesceMessages(input)).toEqual(input);
  });

  it('merges consecutive assistant messages with a blank line', () => {
    const result = coalesceMessages([
      { role: 'user', content: 'rename it' },
      { role: 'assistant', content: "I'll rename it, confirm?" },
      { role: 'assistant', content: 'Done — renamed.' },
    ]);
    expect(result).toEqual([
      { role: 'user', content: 'rename it' },
      {
        role: 'assistant',
        content: "I'll rename it, confirm?\n\nDone — renamed.",
      },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(coalesceMessages([])).toEqual([]);
  });
});
