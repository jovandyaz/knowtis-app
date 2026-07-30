import type { FileRouteTypes } from '../routeTree.gen';

/** Every path the generated route tree accepts as a `Link`/`navigate`/`redirect` target. */
export type AppRoute = FileRouteTypes['to'];

export const ROUTES = {
  ROOT: '/',
  LOGIN: '/login',
  FORBIDDEN: '/forbidden',
  USERS: '/users',
  AI_METRICS: '/ai-metrics',
  AI_CONFIG: '/ai-config',
  FEATURE_FLAGS: '/feature-flags',
  AUDIT: '/audit',
} as const satisfies Record<string, AppRoute>;
