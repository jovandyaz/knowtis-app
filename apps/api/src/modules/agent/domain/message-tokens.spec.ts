import { describe, expect, it } from 'vitest';

import { estimateTokenCount } from '@knowtis/ai-gateway';

import type { AgentMessagePart } from './agent-message';
import { estimateMessageTokens } from './message-tokens';

const parts: readonly AgentMessagePart[] = [
  {
    type: 'tool-result',
    toolCallId: 'c1',
    toolName: 'getNote',
    output: 'lorem ipsum dolor sit amet '.repeat(200),
    outputType: 'text',
  },
];

describe('estimateMessageTokens', () => {
  it('counts the text of a message that carries no parts', () => {
    expect(
      estimateMessageTokens({ role: 'user', content: 'hello world' })
    ).toBe(estimateTokenCount('hello world'));
  });

  it('charges an empty-content tool row for its serialized parts', () => {
    expect(estimateMessageTokens({ role: 'tool', content: '', parts })).toBe(
      estimateTokenCount(JSON.stringify(parts))
    );
  });

  it('adds the text and the parts of a message that carries both', () => {
    expect(
      estimateMessageTokens({
        role: 'assistant',
        content: 'here it is',
        parts,
      })
    ).toBe(
      estimateTokenCount('here it is') +
        estimateTokenCount(JSON.stringify(parts))
    );
  });
});
