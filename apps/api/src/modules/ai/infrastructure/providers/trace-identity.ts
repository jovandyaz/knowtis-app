import { propagateAttributes } from '@langfuse/tracing';

export interface TraceIdentityAttrs {
  readonly userId?: string;
  readonly tags?: readonly string[];
}

/** Runs an AI SDK call inside a Langfuse trace context carrying user identity.
 * Replaces AI SDK v6 telemetry metadata: trace-level attributes now propagate
 * via OTel context, not per-call options. No-op when no identity is given. */
export function withTraceIdentity<T>(
  identity: TraceIdentityAttrs | undefined,
  fn: () => T
): T {
  if (!identity || (identity.userId === undefined && !identity.tags?.length)) {
    return fn();
  }
  return propagateAttributes(
    {
      ...(identity.userId !== undefined ? { userId: identity.userId } : {}),
      ...(identity.tags?.length ? { tags: [...identity.tags] } : {}),
    },
    fn
  );
}
