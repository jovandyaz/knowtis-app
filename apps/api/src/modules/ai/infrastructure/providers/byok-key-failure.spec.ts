import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  APICallError,
  generateText,
  RetryError,
  streamText,
  wrapLanguageModel,
  type LanguageModel,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ByokKeyFailureKind, ByokProvider } from '@knowtis/shared-types';

import {
  byokKeyRefusalMiddleware,
  classifyByokKeyFailure,
} from './byok-key-failure';

function callError(statusCode: number, responseBody = '') {
  return new APICallError({
    message: 'provider refused',
    url: 'https://provider.test/v1',
    requestBodyValues: {},
    statusCode,
    responseBody,
  });
}

describe('classifyByokKeyFailure', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each<{
    provider: ByokProvider;
    status: number;
    body: string;
    expected: ByokKeyFailureKind | null;
  }>([
    {
      provider: 'anthropic',
      status: 401,
      body: '{"type":"error","error":{"type":"authentication_error"}}',
      expected: 'auth',
    },
    {
      provider: 'anthropic',
      status: 400,
      body: '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
      expected: 'credit',
    },
    {
      provider: 'anthropic',
      status: 400,
      body: '{"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified workspace API usage limits."}}',
      expected: null,
    },
    {
      provider: 'anthropic',
      status: 400,
      body: '{"type":"error","error":{"type":"api_error","message":"Your credit balance is too low to access the Anthropic API."}}',
      expected: null,
    },
    {
      provider: 'anthropic',
      status: 400,
      body: '{"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API."}}',
      expected: null,
    },
    {
      provider: 'anthropic',
      status: 402,
      body: '{"type":"error","error":{"type":"billing_error"}}',
      expected: 'credit',
    },
    {
      provider: 'anthropic',
      status: 403,
      body: '{"type":"error","error":{"type":"permission_error"}}',
      expected: 'permission',
    },
    {
      provider: 'anthropic',
      status: 429,
      body: '{"type":"error","error":{"type":"rate_limit_error"}}',
      expected: null,
    },
    {
      provider: 'anthropic',
      status: 529,
      body: '{"type":"error","error":{"type":"overloaded_error"}}',
      expected: null,
    },
    {
      provider: 'openai',
      status: 401,
      body: '{"error":{"code":"invalid_api_key"}}',
      expected: 'auth',
    },
    {
      provider: 'openai',
      status: 403,
      body: '{"error":{"code":"unsupported_country_region_territory"}}',
      expected: 'permission',
    },
    {
      provider: 'openai',
      status: 429,
      body: '{"error":{"type":"insufficient_quota","code":"insufficient_quota"}}',
      expected: 'credit',
    },
    {
      provider: 'openai',
      status: 429,
      body: '{"error":{"code":"credit_balance_exhausted"}}',
      expected: 'credit',
    },
    {
      provider: 'openai',
      status: 429,
      body: '{"error":{"type":"insufficient_quota","code":"organization_spend_limit_exceeded"}}',
      expected: 'credit',
    },
    {
      provider: 'openai',
      status: 429,
      body: '{"error":{"type":"insufficient_quota","code":429}}',
      expected: 'credit',
    },
    {
      provider: 'openai',
      status: 429,
      body: '{"error":{"type":"requests","code":"rate_limit_exceeded"}}',
      expected: null,
    },
    { provider: 'openai', status: 429, body: '', expected: null },
    {
      provider: 'openai',
      status: 429,
      body: 'upstream said insufficient_quota',
      expected: null,
    },
    {
      provider: 'openrouter',
      status: 401,
      body: '{"error":{"code":401,"message":"No auth credentials found"}}',
      expected: 'auth',
    },
    {
      provider: 'openrouter',
      status: 402,
      body: '{"error":{"code":402,"message":"Insufficient credits"}}',
      expected: 'credit',
    },
    {
      provider: 'openrouter',
      status: 403,
      body: '{"error":{"code":403,"message":"Input flagged by moderation"}}',
      expected: null,
    },
    {
      provider: 'google',
      status: 400,
      body: '{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"bad schema"}}',
      expected: null,
    },
    {
      provider: 'google',
      status: 400,
      body: '{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"API_KEY_INVALID is not a valid enum value","details":[{"reason":"FIELD_INVALID"}]}}',
      expected: null,
    },
    {
      provider: 'google',
      status: 401,
      body: '{"error":{"code":401,"status":"UNAUTHENTICATED"}}',
      expected: 'auth',
    },
    {
      provider: 'google',
      status: 402,
      body: '{"error":{"code":402,"message":"Your Prepay credit balance is depleted."}}',
      expected: 'credit',
    },
    {
      provider: 'google',
      status: 403,
      body: '{"error":{"code":403,"status":"PERMISSION_DENIED"}}',
      expected: 'permission',
    },
    {
      provider: 'google',
      status: 429,
      body: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}',
      expected: null,
    },
  ])(
    '$provider $status → $expected',
    ({ provider, status, body, expected }) => {
      expect(classifyByokKeyFailure(callError(status, body), provider)).toBe(
        expected
      );
    }
  );

  it('reads a Gemini 400 API_KEY_INVALID as a bad key', () => {
    const badKey = callError(
      400,
      '{"error":{"code":400,"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}'
    );
    const badKeyWithoutStatus = callError(
      400,
      '{"error":{"code":400,"message":"API key not valid.","details":[{"reason":"API_KEY_INVALID"}]}}'
    );
    expect(classifyByokKeyFailure(badKey, 'google')).toBe('auth');
    expect(classifyByokKeyFailure(badKeyWithoutStatus, 'google')).toBe('auth');
  });

  it('reads the last attempt of a retried call', () => {
    const retried = new RetryError({
      message: 'Failed after 3 attempts',
      reason: 'maxRetriesExceeded',
      errors: [
        callError(503),
        callError(429, '{"error":{"code":"insufficient_quota"}}'),
      ],
    });
    expect(classifyByokKeyFailure(retried, 'openai')).toBe('credit');
  });

  it('recognises the error the OpenRouter SDK throws from its own bundled class', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { error: { code: 402, message: 'Insufficient credits' } },
        { status: 402 }
      )
    );
    const refused = await generateText({
      model: createOpenRouter({ apiKey: 'local-not-a-real-key' })(
        'deepseek/deepseek-v3.2'
      ),
      prompt: 'ping',
      maxRetries: 0,
    }).catch((error: unknown) => error);
    expect(classifyByokKeyFailure(refused, 'openrouter')).toBe('credit');
  });

  it('classifies nothing that is not a provider call error', () => {
    expect(classifyByokKeyFailure(new Error('socket hang up'), 'openai')).toBe(
      null
    );
    expect(classifyByokKeyFailure({ statusCode: 401 }, 'openai')).toBe(null);
  });

  it('classifies nothing from a call error that carries no status', () => {
    const statusless = new APICallError({
      message: 'Failed to process successful response',
      url: 'https://provider.test/v1',
      requestBodyValues: {},
    });
    expect(classifyByokKeyFailure(statusless, 'anthropic')).toBe(null);
  });
});

describe('byokKeyRefusalMiddleware', () => {
  const SDK_RETRIES = 3;
  const OUT_OF_QUOTA = '{"error":{"code":"insufficient_quota"}}';
  const RATE_LIMITED = '{"error":{"code":"rate_limit_exceeded"}}';

  function tooManyRequests(responseBody: string) {
    return new APICallError({
      message: 'provider refused',
      url: 'https://provider.test/v1',
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { 'retry-after-ms': '0' },
      responseBody,
    });
  }

  function refusingModel(error: APICallError) {
    const doStream = vi.fn(async () => {
      throw error;
    });
    const doGenerate = vi.fn(async () => {
      throw error;
    });
    const model = wrapLanguageModel({
      model: new MockLanguageModelV4({ doStream, doGenerate }),
      middleware: byokKeyRefusalMiddleware('openai'),
    });
    return { model, doStream, doGenerate };
  }

  async function streamedError(model: LanguageModel): Promise<unknown> {
    const result = streamText({
      model,
      prompt: 'ping',
      maxRetries: SDK_RETRIES,
      onError: () => undefined,
    });
    for await (const part of result.stream) {
      if (part.type === 'error') {
        return part.error;
      }
    }
    return undefined;
  }

  it('sends a key the provider refused only once, whatever its status', async () => {
    const upstream = new Error('upstream refusal');
    const refused = new APICallError({
      message: 'You exceeded your current quota.',
      url: 'https://provider.test/v1/responses',
      requestBodyValues: { model: 'gpt-5.6-terra', input: 'ping' },
      statusCode: 429,
      responseHeaders: { 'retry-after-ms': '0', 'x-request-id': 'req_1' },
      responseBody: OUT_OF_QUOTA,
      cause: upstream,
      data: { error: { code: 'insufficient_quota' } },
    });
    expect(refused.isRetryable).toBe(true);
    const { model, doStream } = refusingModel(refused);

    const error = await streamedError(model);

    expect(doStream).toHaveBeenCalledTimes(1);
    if (!APICallError.isInstance(error)) {
      throw new Error('expected the refusal to surface as an APICallError');
    }
    expect(error).not.toBe(refused);
    expect(error.isRetryable).toBe(false);
    expect(classifyByokKeyFailure(error, 'openai')).toBe('credit');
    expect({
      message: error.message,
      url: error.url,
      requestBodyValues: error.requestBodyValues,
      statusCode: error.statusCode,
      responseHeaders: error.responseHeaders,
      responseBody: error.responseBody,
      data: error.data,
    }).toEqual({
      message: 'You exceeded your current quota.',
      url: 'https://provider.test/v1/responses',
      requestBodyValues: { model: 'gpt-5.6-terra', input: 'ping' },
      statusCode: 429,
      responseHeaders: { 'retry-after-ms': '0', 'x-request-id': 'req_1' },
      responseBody: OUT_OF_QUOTA,
      data: { error: { code: 'insufficient_quota' } },
    });
    expect(error.cause).toBe(upstream);
  });

  it('keeps the SDK retries for a genuine rate limit', async () => {
    const { model, doStream } = refusingModel(tooManyRequests(RATE_LIMITED));

    const error = await streamedError(model);

    expect(doStream).toHaveBeenCalledTimes(SDK_RETRIES + 1);
    expect(RetryError.isInstance(error)).toBe(true);
  });

  it('sends a generate call the provider refused for the key only once', async () => {
    const { model, doGenerate } = refusingModel(tooManyRequests(OUT_OF_QUOTA));

    const error = await generateText({
      model,
      prompt: 'ping',
      maxRetries: SDK_RETRIES,
    }).catch((failure: unknown) => failure);

    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(APICallError.isInstance(error) && error.isRetryable).toBe(false);
  });

  it.each([
    {
      case: 'an unclassified retryable call error',
      error: new APICallError({
        message: 'overloaded',
        url: 'https://provider.test/v1',
        requestBodyValues: {},
        statusCode: 503,
      }),
    },
    {
      case: 'a key refusal the SDK already will not retry',
      error: new APICallError({
        message: 'invalid key',
        url: 'https://provider.test/v1',
        requestBodyValues: {},
        statusCode: 401,
        responseBody: '{"error":{"code":"invalid_api_key"}}',
      }),
    },
  ])('rethrows $case as the same object', async ({ error }) => {
    const { model } = refusingModel(error);

    await expect(model.doStream({ prompt: [] })).rejects.toBe(error);
    await expect(model.doGenerate({ prompt: [] })).rejects.toBe(error);
  });

  it('passes an unclassified failure through untouched', async () => {
    const outage = new Error('socket hang up');
    const doStream = vi.fn(async () => {
      throw outage;
    });
    const model = wrapLanguageModel({
      model: new MockLanguageModelV4({ doStream }),
      middleware: byokKeyRefusalMiddleware('openai'),
    });

    await expect(streamedError(model)).resolves.toBe(outage);
  });
});
