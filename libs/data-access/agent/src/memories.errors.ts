import { ApiClientError } from '@knowtis/api-client';
import {
  AGENT_MEMORY_REJECTED_CODE,
  AGENT_MEMORY_UNAVAILABLE_CODE,
  MEMORY_EDIT_REJECTION_REASONS,
  MEMORY_EDIT_UNAVAILABLE_REASONS,
  type MemoryEditRejectionReason,
  type MemoryEditUnavailableReason,
} from '@knowtis/shared-types';

import { NOT_FOUND_STATUS } from './api-errors';

/** Why a memory edit failed, in the terms the person editing it can act on. */
export const MEMORY_EDIT_FAILURE = {
  CONTENT_POLICY: 'contentPolicy',
  INJECTION: 'injection',
  REJECTED: 'rejected',
  RATE_LIMITED: 'rateLimited',
  SCREENING_UNAVAILABLE: 'screeningUnavailable',
  EMBEDDINGS_FAILED: 'embeddingsFailed',
  EMBEDDINGS_UNAVAILABLE: 'embeddingsUnavailable',
  UNAVAILABLE: 'unavailable',
  INVALID: 'invalid',
  NOT_FOUND: 'notFound',
  NETWORK: 'network',
  FAILED: 'failed',
} as const;

export type MemoryEditFailure =
  (typeof MEMORY_EDIT_FAILURE)[keyof typeof MEMORY_EDIT_FAILURE];

const HTTP_STATUS = {
  NO_RESPONSE: 0,
  BAD_REQUEST: 400,
  NOT_FOUND: NOT_FOUND_STATUS,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
} as const;

const FAILURE_BY_REJECTION = {
  content_policy: MEMORY_EDIT_FAILURE.CONTENT_POLICY,
  injection: MEMORY_EDIT_FAILURE.INJECTION,
} as const satisfies Record<MemoryEditRejectionReason, MemoryEditFailure>;

const FAILURE_BY_UNAVAILABLE_REASON = {
  screening_unavailable: MEMORY_EDIT_FAILURE.SCREENING_UNAVAILABLE,
  embeddings_failed: MEMORY_EDIT_FAILURE.EMBEDDINGS_FAILED,
  embeddings_unavailable: MEMORY_EDIT_FAILURE.EMBEDDINGS_UNAVAILABLE,
} as const satisfies Record<MemoryEditUnavailableReason, MemoryEditFailure>;

function reasonAmong<T extends string>(
  reasons: readonly T[],
  value: unknown
): T | undefined {
  return reasons.find((reason) => reason === value);
}

function rejectionFailure(error: ApiClientError): MemoryEditFailure {
  const reason = reasonAmong(
    MEMORY_EDIT_REJECTION_REASONS,
    error.details?.['reason']
  );
  return error.code === AGENT_MEMORY_REJECTED_CODE && reason
    ? FAILURE_BY_REJECTION[reason]
    : MEMORY_EDIT_FAILURE.REJECTED;
}

function unavailableFailure(error: ApiClientError): MemoryEditFailure {
  const reason = reasonAmong(
    MEMORY_EDIT_UNAVAILABLE_REASONS,
    error.details?.['reason']
  );
  return error.code === AGENT_MEMORY_UNAVAILABLE_CODE && reason
    ? FAILURE_BY_UNAVAILABLE_REASON[reason]
    : MEMORY_EDIT_FAILURE.UNAVAILABLE;
}

/** Why `PATCH /agent/memories/:id` failed; `network` when the API never answered, `failed` for an answer this client does not expect. */
export function memoryEditFailureOf(error: unknown): MemoryEditFailure {
  if (!ApiClientError.isApiClientError(error)) {
    return MEMORY_EDIT_FAILURE.FAILED;
  }
  switch (error.status) {
    case HTTP_STATUS.NO_RESPONSE:
      return MEMORY_EDIT_FAILURE.NETWORK;
    case HTTP_STATUS.BAD_REQUEST:
      return MEMORY_EDIT_FAILURE.INVALID;
    case HTTP_STATUS.NOT_FOUND:
      return MEMORY_EDIT_FAILURE.NOT_FOUND;
    case HTTP_STATUS.UNPROCESSABLE_ENTITY:
      return rejectionFailure(error);
    case HTTP_STATUS.TOO_MANY_REQUESTS:
      return MEMORY_EDIT_FAILURE.RATE_LIMITED;
    case HTTP_STATUS.SERVICE_UNAVAILABLE:
      return unavailableFailure(error);
    default:
      return MEMORY_EDIT_FAILURE.FAILED;
  }
}
