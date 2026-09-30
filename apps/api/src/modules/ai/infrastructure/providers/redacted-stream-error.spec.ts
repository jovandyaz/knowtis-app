import { APICallError, streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logStreamErrorRedacted } from './redacted-stream-error';

function refusal() {
  return new APICallError({
    message: 'Incorrect API key provided: sk-secret-123',
    url: 'https://api.openai.com/v1/responses',
    requestBodyValues: { input: 'the user note' },
    statusCode: 401,
    responseBody: '{"error":{"message":"sk-secret-123"}}',
    isRetryable: false,
  });
}

function refusingModel() {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw refusal();
    },
  });
}

async function drain(
  onError?: (event: { error: unknown }) => void
): Promise<number> {
  const result = streamText({
    model: refusingModel(),
    prompt: 'ping',
    maxRetries: 0,
    ...(onError ? { onError } : {}),
  });
  let parts = 0;
  for await (const _part of result.stream) {
    parts += 1;
  }
  return parts;
}

describe('logStreamErrorRedacted', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('control: without it the SDK prints the provider error to console.error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await drain();

    expect(consoleError).toHaveBeenCalled();
  });

  it('keeps the provider error off console.error and logs only name and status', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const debug = vi.fn();

    await drain(logStreamErrorRedacted({ debug }, { model: 'openai:m' }));

    expect(consoleError).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith({
      event: 'ai.stream.error_part',
      model: 'openai:m',
      errorName: 'AI_APICallError',
      statusCode: 401,
    });
    expect(JSON.stringify(debug.mock.calls)).not.toContain('sk-secret');
  });
});
