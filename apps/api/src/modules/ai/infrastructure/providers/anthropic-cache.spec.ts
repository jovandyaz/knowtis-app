import { describe, expect, it } from 'vitest';

import { cacheableSystem, withLastMessageCache } from './anthropic-cache';

const EPHEMERAL = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
};

describe('cacheableSystem', () => {
  it('wraps the system prompt with anthropic cacheControl for anthropic models', () => {
    const result = cacheableSystem(
      'anthropic:claude-sonnet-4-6',
      'You are a helpful assistant.'
    );

    expect(result).toEqual({
      system: {
        role: 'system',
        content: 'You are a helpful assistant.',
        providerOptions: EPHEMERAL,
      },
    });
  });

  it('passes the system prompt through as a plain string for non-anthropic models', () => {
    const result = cacheableSystem('openai:gpt-4o', 'You are helpful.');

    expect(result).toEqual({ system: 'You are helpful.' });
  });
});

describe('withLastMessageCache', () => {
  const messages = [
    { role: 'user' as const, content: 'first' },
    { role: 'assistant' as const, content: 'second' },
    { role: 'user' as const, content: 'third' },
  ];

  it('marks only the last message with anthropic cacheControl', () => {
    const result = withLastMessageCache(
      'anthropic:claude-sonnet-4-6',
      messages
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: 'user', content: 'first' });
    expect(result[0]).not.toHaveProperty('providerOptions');
    expect(result[1]).not.toHaveProperty('providerOptions');
    expect(result[2]).toEqual({
      role: 'user',
      content: 'third',
      providerOptions: EPHEMERAL,
    });
  });

  it('does not mutate the input array or its elements', () => {
    const result = withLastMessageCache(
      'anthropic:claude-sonnet-4-6',
      messages
    );

    expect(result).not.toBe(messages);
    expect(messages[2]).toEqual({ role: 'user', content: 'third' });
  });

  it('returns an untouched copy for non-anthropic models', () => {
    const result = withLastMessageCache('openai:gpt-4o', messages);

    expect(result).not.toBe(messages);
    expect(result).toEqual(messages);
    for (const message of result) {
      expect(message).not.toHaveProperty('providerOptions');
    }
  });

  it('handles an empty message array safely', () => {
    expect(withLastMessageCache('anthropic:claude-sonnet-4-6', [])).toEqual([]);
  });
});
