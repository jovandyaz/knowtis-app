import { describe, expect, it } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { conversationErrorKey } from './conversation-error';

describe('conversationErrorKey', () => {
  it('names a conversation that no longer exists', () => {
    expect(conversationErrorKey(new ApiClientError('Not found', 404))).toBe(
      'ai.copilot.history.gone'
    );
  });

  it('falls back to the generic failure for anything else', () => {
    expect(conversationErrorKey(new ApiClientError('boom', 500))).toBe(
      'ai.errors.generic'
    );
    expect(conversationErrorKey(new Error('offline'))).toBe(
      'ai.errors.generic'
    );
  });
});
