import type { AuthUserProfile } from '@jovandyaz/auth-react';
import type { PostHog } from 'posthog-js';

import { runAnalyticsSafely } from './best-effort';
import { setAnalyticsContext } from './product-events';

type IdentityClient = Pick<PostHog, 'identify' | 'reset'>;

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
  sync(user: AuthUserProfile | null): void;
} {
  let lastIdentity: NormalizedIdentity | undefined;

  return {
    sync(user) {
      const identity = normalizeIdentity(user);
      if (identitiesMatch(lastIdentity, identity)) {
        return;
      }

      if (identity.actor_type === 'anonymous') {
        if (lastIdentity?.actor_type === 'registered') {
          runAnalyticsSafely(() => client.reset());
        }
        setAnalyticsContext({
          environment: 'production',
          app_version: import.meta.env.VITE_APP_VERSION || '0.1.0',
          actor_type: 'anonymous',
          is_internal: false,
          locale: identity.locale,
        });
      } else {
        runAnalyticsSafely(() => {
          client.identify(identity.id, {
            email: identity.email,
            name: identity.name,
            role: identity.role,
            locale: identity.locale,
            is_internal: identity.is_internal,
          });
        });
        setAnalyticsContext({
          environment: 'production',
          app_version: import.meta.env.VITE_APP_VERSION || '0.1.0',
          actor_type: 'registered',
          is_internal: identity.is_internal,
          locale: identity.locale,
        });
      }

      lastIdentity = identity;
    },
  };
}
