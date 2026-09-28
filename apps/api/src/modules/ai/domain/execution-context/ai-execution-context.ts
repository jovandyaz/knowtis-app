import type { AccessTier, ByokProvider } from '@knowtis/shared-types';

import type { TierPolicy } from './tier-policy';

/** Who pays for a model call. BYOK names the provider whose stored key serves it; the key itself never travels in a context. */
export type Billing =
  | { readonly kind: 'platform' }
  | { readonly kind: 'byok'; readonly provider: ByokProvider };

/** Caller facts an entry point knows before tier resolution. */
export interface AiCaller {
  readonly userId: string;
  readonly isAnonymous: boolean;
  readonly clientIp?: string;
}

export interface AiSubject {
  readonly userId: string;
  readonly clientIp?: string;
}

/** Resolved once per request or turn by `TierResolver`; every AI call site takes it instead of loose booleans. */
export interface AiExecutionContext {
  readonly subject: AiSubject;
  readonly tier: AccessTier;
  readonly billing: Billing;
  readonly policy: TierPolicy;
  /** Providers the caller holds a stored key for; empty below the byok tier. */
  readonly byokProviders: ReadonlySet<ByokProvider>;
}

export const PLATFORM_BILLING: Billing = { kind: 'platform' };

function holdsKeyFor(
  keyed: ReadonlySet<ByokProvider>,
  provider: string
): provider is ByokProvider {
  const held: ReadonlySet<string> = keyed;
  return held.has(provider);
}

/** The context billed to the caller's stored key for `provider`, or the context unchanged when the caller holds no key for it. */
export function billingFor(
  execution: AiExecutionContext,
  provider: string
): AiExecutionContext {
  return holdsKeyFor(execution.byokProviders, provider)
    ? { ...execution, billing: { kind: 'byok', provider } }
    : execution;
}
