import type { FileRouteTypes } from '../routeTree.gen';

type AppRoute = FileRouteTypes['to'];

export const ROUTES = {
  ROOT: '/',
  DASHBOARD: '/dashboard',
  NOTES: '/notes',
  NOTE: '/notes/$noteId',
  OAUTH_CONSENT: '/oauth/consent',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  VERIFY_EMAIL: '/verify-email',
} as const satisfies Record<string, AppRoute>;
