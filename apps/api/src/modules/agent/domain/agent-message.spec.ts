import { describe, expect, it } from 'vitest';

import { textOfParts, type AgentMessagePart } from './agent-message';

describe('textOfParts', () => {
  it('concatenates text parts in order and ignores tool parts', () => {
    const parts: AgentMessagePart[] = [
      { type: 'text', text: 'Let me ' },
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'searchNotes',
        input: { query: 'gtd' },
      },
      { type: 'text', text: 'look.' },
    ];
    expect(textOfParts(parts)).toBe('Let me look.');
  });

  it('returns an empty string for tool-only parts', () => {
    expect(
      textOfParts([
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'searchNotes',
          output: { hits: [] },
          outputType: 'json',
        },
      ])
    ).toBe('');
  });
});
