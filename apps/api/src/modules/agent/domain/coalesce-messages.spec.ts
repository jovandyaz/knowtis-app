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

  it('never merges a message that carries parts', () => {
    const result = coalesceMessages([
      { role: 'assistant', content: 'a' },
      {
        role: 'assistant',
        content: '',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'c',
            toolName: 'getNote',
            input: {},
          },
        ],
      },
      {
        role: 'tool',
        content: '',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'c',
            toolName: 'getNote',
            output: 'x',
            outputType: 'text',
          },
        ],
      },
      { role: 'assistant', content: 'b' },
      { role: 'assistant', content: 'c' },
    ]);
    expect(
      result.map((m) => [m.role, m.content, m.parts?.length ?? 0])
    ).toEqual([
      ['assistant', 'a', 0],
      ['assistant', '', 1],
      ['tool', '', 1],
      ['assistant', 'b\n\nc', 0],
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(coalesceMessages([])).toEqual([]);
  });
});
