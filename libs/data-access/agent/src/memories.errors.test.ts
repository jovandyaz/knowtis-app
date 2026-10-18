import { describe, expect, it } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import {
  AGENT_MEMORY_REJECTED_CODE,
  AGENT_MEMORY_UNAVAILABLE_CODE,
} from '@knowtis/shared-types';

import { memoryEditFailureOf } from './memories.errors';

function apiError(
  status: number,
  code?: string,
  details?: Record<string, unknown>
): ApiClientError {
  return new ApiClientError(
    'refused',
    status,
    code,
    undefined,
    undefined,
    details
  );
}

describe('memoryEditFailureOf', () => {
  it.each([
    [
      'a refused link or markup',
      apiError(422, AGENT_MEMORY_REJECTED_CODE, { reason: 'content_policy' }),
      'contentPolicy',
    ],
    [
      'text read as an instruction',
      apiError(422, AGENT_MEMORY_REJECTED_CODE, { reason: 'injection' }),
      'injection',
    ],
    [
      'the AI rate limit',
      apiError(429, 'AI_RATE_LIMIT_EXCEEDED'),
      'rateLimited',
    ],
    [
      'a classifier that could not decide',
      apiError(503, AGENT_MEMORY_UNAVAILABLE_CODE, {
        reason: 'screening_unavailable',
      }),
      'screeningUnavailable',
    ],
    [
      'a failed embedding',
      apiError(503, AGENT_MEMORY_UNAVAILABLE_CODE, {
        reason: 'embeddings_failed',
      }),
      'embeddingsFailed',
    ],
    [
      'a server with no embedding provider',
      apiError(503, AGENT_MEMORY_UNAVAILABLE_CODE, {
        reason: 'embeddings_unavailable',
      }),
      'embeddingsUnavailable',
    ],
    ['a tier that could not be resolved', apiError(503), 'unavailable'],
    [
      'a memory 503 with a reason this client does not know',
      apiError(503, AGENT_MEMORY_UNAVAILABLE_CODE, { reason: 'tomorrow' }),
      'unavailable',
    ],
    ['text out of bounds', apiError(400), 'invalid'],
    ['a memory the caller does not have', apiError(404), 'notFound'],
    [
      'a refusal with a reason this client does not know',
      apiError(422, AGENT_MEMORY_REJECTED_CODE, { reason: 'tomorrow' }),
      'rejected',
    ],
    [
      'a 422 without the memory code',
      apiError(422, 'VALIDATION_ERROR', { reason: 'content_policy' }),
      'rejected',
    ],
    ['a server error', apiError(500), 'failed'],
    ['a forbidden write', apiError(403), 'failed'],
    ['a network failure', apiError(0, 'NETWORK_ERROR'), 'network'],
    ['a request that timed out', apiError(0, 'ABORTED'), 'network'],
    ['an error that never reached the API', new Error('boom'), 'failed'],
  ])('reads %s as %s', (_label, error, failure) => {
    expect(memoryEditFailureOf(error)).toBe(failure);
  });
});
