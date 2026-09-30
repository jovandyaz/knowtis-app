import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { APICallError, generateText, RetryError } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ByokKeyFailureKind, ByokProvider } from '@knowtis/shared-types';

import { classifyByokKeyFailure } from './byok-key-failure';

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

  it('reads a Gemini 400 API_KEY_INVALID as a bad key (UNCONFIRMED against the live API)', () => {
    const badKey = callError(
      400,
      '{"error":{"code":400,"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}'
    );
    expect(classifyByokKeyFailure(badKey, 'google')).toBe('auth');
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
