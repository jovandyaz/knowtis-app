import type { AuthUserProfile } from '@jovandyaz/auth-react';
import type { PostHog } from 'posthog-js';

import { runAnalyticsSafely } from './best-effort';
import { setAnalyticsContext } from './product-events';
import { pauseAnalyticsCapture, resumeAnalyticsCapture } from './runtime';

type IdentityClient = Pick<PostHog, 'identify' | 'reset'>;
type IdentitySynchronizer = ReturnType<typeof createIdentitySynchronizer>;

const IDENTITY_RETRY_DELAY_MS = 1_000;
const MAX_IDENTITY_SYNC_ATTEMPTS = 3;

type NormalizedIdentity =
  | { actor_type: 'anonymous'; locale: string }
  | {
      actor_type: 'registered';
      id: string;
      email: string;
      name: string;
      role: 'user' | 'admin';
      locale: string;
      is_internal: boolean;
    };

function normalizeIdentity(user: AuthUserProfile | null): NormalizedIdentity {
  if (user === null || user.isAnonymous === true) {
    return { actor_type: 'anonymous', locale: user?.locale ?? 'es' };
  }

  const role = user.role ?? 'user';
  return {
    actor_type: 'registered',
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    locale: user.locale ?? 'es',
    is_internal: role === 'admin',
  };
}

function identitiesMatch(
  left: NormalizedIdentity | undefined,
  right: NormalizedIdentity
): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

export function createIdentitySynchronizer(client: IdentityClient): {
  sync(user: AuthUserProfile | null): boolean;
} {
  let lastIdentity: NormalizedIdentity | undefined;

  return {
    sync(user) {
      const identity = normalizeIdentity(user);
      if (identitiesMatch(lastIdentity, identity)) {
        return true;
      }

      pauseAnalyticsCapture();

      const requiresReset =
        lastIdentity?.actor_type === 'registered' &&
        (identity.actor_type === 'anonymous' ||
          identity.id !== lastIdentity.id);
      if (requiresReset && !runAnalyticsSafely(() => client.reset())) {
        return false;
      }

      if (identity.actor_type === 'anonymous') {
        if (
          !setAnalyticsContext({
            environment: 'production',
            app_version: import.meta.env.VITE_APP_VERSION || '0.1.0',
            actor_type: 'anonymous',
            is_internal: false,
            locale: identity.locale,
          })
        ) {
          return false;
        }
      } else {
        if (
          !runAnalyticsSafely(() => {
            client.identify(identity.id, {
              email: identity.email,
              name: identity.name,
              role: identity.role,
              locale: identity.locale,
              is_internal: identity.is_internal,
            });
          })
        ) {
          return false;
        }
        if (
          !setAnalyticsContext({
            environment: 'production',
            app_version: import.meta.env.VITE_APP_VERSION || '0.1.0',
            actor_type: 'registered',
            is_internal: identity.is_internal,
            locale: identity.locale,
          })
        ) {
          return false;
        }
      }

      lastIdentity = identity;
      resumeAnalyticsCapture();
      return true;
    },
  };
}

export function createIdentityRetryController(
  synchronizer: IdentitySynchronizer
): {
  sync(user: AuthUserProfile | null): void;
  stop(): void;
} {
  let activeSequence = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const clearRetry = () => {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const attemptSync = (
    user: AuthUserProfile | null,
    attempt: number,
    sequence: number
  ) => {
    if (stopped || sequence !== activeSequence) {
      return;
    }
    if (synchronizer.sync(user) || attempt >= MAX_IDENTITY_SYNC_ATTEMPTS) {
      return;
    }

    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      attemptSync(user, attempt + 1, sequence);
    }, IDENTITY_RETRY_DELAY_MS);
  };

  return {
    sync(user) {
      if (stopped) {
        return;
      }
      activeSequence += 1;
      clearRetry();
      attemptSync(user, 1, activeSequence);
    },
    stop() {
      stopped = true;
      activeSequence += 1;
      clearRetry();
    },
  };
}
