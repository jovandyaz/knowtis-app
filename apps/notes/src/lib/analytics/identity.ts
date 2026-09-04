import type { AuthUserProfile } from '@jovandyaz/auth-react';
import type { PostHog } from 'posthog-js';

import { DEFAULT_LOCALE, logger } from '@knowtis/shared-util';

import { runAnalyticsSafely } from './best-effort';
import { ANALYTICS_ENVIRONMENT, APP_VERSION } from './constants';
import {
  setAnalyticsContext,
  type BrowserActorContext,
} from './product-events';
import {
  isAnalyticsReady,
  pauseAnalyticsCapture,
  resumeAnalyticsCapture,
} from './runtime';

type IdentityClient = Pick<
  PostHog,
  'identify' | 'reset' | 'get_distinct_id' | 'get_property'
>;

export interface IdentitySynchronizer {
  sync(user: AuthUserProfile | null): boolean;
  recover(user: AuthUserProfile | null): void;
}

const IDENTITY_RETRY_DELAY_MS = 1_000;
const MAX_IDENTITY_SYNC_ATTEMPTS = 3;
const USER_STATE_PROPERTY = '$user_state';
const IDENTIFIED_USER_STATE = 'identified';

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
  const locale = user?.locale ?? DEFAULT_LOCALE;
  if (user === null || user.isAnonymous === true) {
    return { actor_type: 'anonymous', locale };
  }

  const role = user.role ?? 'user';
  return {
    actor_type: 'registered',
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    locale,
    is_internal: role === 'admin',
  };
}

function identitiesMatch(
  left: NormalizedIdentity | undefined,
  right: NormalizedIdentity
): boolean {
  if (left === undefined || left.locale !== right.locale) {
    return false;
  }
  if (left.actor_type === 'anonymous' || right.actor_type === 'anonymous') {
    return left.actor_type === right.actor_type;
  }
  return (
    left.id === right.id &&
    left.email === right.email &&
    left.name === right.name &&
    left.role === right.role
  );
}

function contextFor(identity: NormalizedIdentity): BrowserActorContext {
  return {
    environment: ANALYTICS_ENVIRONMENT,
    app_version: APP_VERSION,
    actor_type: identity.actor_type,
    is_internal:
      identity.actor_type === 'registered' ? identity.is_internal : false,
    locale: identity.locale,
  };
}

/**
 * PostHog persists its identified state across page loads, so a fresh
 * synchronizer must not trust that it starts anonymous: a stale identified
 * distinct ID would attribute this session's events to the previous account.
 */
function holdsStalePersistedIdentity(
  client: IdentityClient,
  identity: NormalizedIdentity
): boolean {
  if (!isAnalyticsReady()) {
    return false;
  }
  let identified = false;
  let distinctId: string | undefined;
  runAnalyticsSafely(() => {
    identified =
      client.get_property(USER_STATE_PROPERTY) === IDENTIFIED_USER_STATE;
    distinctId = client.get_distinct_id();
  });
  if (!identified) {
    return false;
  }
  return identity.actor_type === 'anonymous' || identity.id !== distinctId;
}

export function createIdentitySynchronizer(
  client: IdentityClient
): IdentitySynchronizer {
  let lastIdentity: NormalizedIdentity | undefined;

  const requiresReset = (identity: NormalizedIdentity): boolean => {
    if (lastIdentity === undefined) {
      return holdsStalePersistedIdentity(client, identity);
    }
    return (
      lastIdentity.actor_type === 'registered' &&
      (identity.actor_type === 'anonymous' || identity.id !== lastIdentity.id)
    );
  };

  return {
    sync(user) {
      const identity = normalizeIdentity(user);
      if (identitiesMatch(lastIdentity, identity)) {
        resumeAnalyticsCapture();
        return true;
      }

      pauseAnalyticsCapture();

      if (
        requiresReset(identity) &&
        !runAnalyticsSafely(() => client.reset())
      ) {
        return false;
      }
      if (
        identity.actor_type === 'registered' &&
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
      if (!setAnalyticsContext(contextFor(identity))) {
        return false;
      }

      lastIdentity = identity;
      resumeAnalyticsCapture();
      return true;
    },

    recover(user) {
      const anonymous: NormalizedIdentity = {
        actor_type: 'anonymous',
        locale: normalizeIdentity(user).locale,
      };
      runAnalyticsSafely(() => client.reset());
      lastIdentity = setAnalyticsContext(contextFor(anonymous))
        ? anonymous
        : undefined;
      resumeAnalyticsCapture();
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
    if (synchronizer.sync(user)) {
      return;
    }
    if (attempt >= MAX_IDENTITY_SYNC_ATTEMPTS) {
      logger.warn(
        `Analytics identity sync failed after ${attempt} attempts; continuing with an anonymous identity`,
        { context: 'analytics' }
      );
      synchronizer.recover(user);
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
