import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  guardVerifyEmailRoute,
  parseVerifyEmailSearch,
} from './verify-email-guard';

const TOKEN = 'link-token';
const DASHBOARD = 'dashboard';
const VERIFY_PAGE = 'verify page';

const VERIFIED_AT = '2026-08-29T10:00:00.000Z';

const authState: {
  isAuthenticated: boolean;
  user: { isAnonymous?: boolean; emailVerifiedAt?: string | null } | null;
} = { isAuthenticated: false, user: null };

vi.mock('./setup', () => ({
  authStore: { getState: () => authState },
}));

function renderAt(search: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.DASHBOARD,
    component: () => <p>{DASHBOARD}</p>,
  });
  const verifyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.VERIFY_EMAIL,
    validateSearch: parseVerifyEmailSearch,
    beforeLoad: guardVerifyEmailRoute,
    component: () => <p>{VERIFY_PAGE}</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([dashboardRoute, verifyRoute]),
    history: createMemoryHistory({
      initialEntries: [`${ROUTES.VERIFY_EMAIL}${search}`],
    }),
  });

  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  authState.isAuthenticated = true;
  authState.user = { isAnonymous: false };
  useVerifyEmailStore.setState({ isOpen: false, source: 'inApp' });
});

describe('the verification link a signed-in user clicks', () => {
  it('offers the code dialog on the dashboard instead of dropping the intent', async () => {
    const router = renderAt(`?token=${TOKEN}`);

    expect(await screen.findByText(DASHBOARD)).toBeInTheDocument();
    // The app root would open a fresh note under the dialog; see the guard.
    expect(router.state.location.pathname).toBe(ROUTES.DASHBOARD);
    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('says the dialog stands in for the link, so it can explain itself', async () => {
    renderAt(`?token=${TOKEN}`);

    expect(await screen.findByText(DASHBOARD)).toBeInTheDocument();
    expect(useVerifyEmailStore.getState().source).toBe('emailLink');
  });

  it('leaves the token nowhere in history for a Back press to find', async () => {
    const router = renderAt(`?token=${TOKEN}`);

    expect(await screen.findByText(DASHBOARD)).toBeInTheDocument();

    // The landed location alone cannot see this: answering the link from the
    // route component instead would also read clean here, having pushed the
    // token entry one Back away.
    expect(router.history.length).toBe(1);
  });

  it('asks nothing of an account that is already verified', async () => {
    authState.user = { isAnonymous: false, emailVerifiedAt: VERIFIED_AT };

    const router = renderAt(`?token=${TOKEN}`);

    expect(await screen.findByText(DASHBOARD)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(ROUTES.DASHBOARD);
    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('raises nothing when the visit carried no token to redeem', async () => {
    renderAt('');

    expect(await screen.findByText(DASHBOARD)).toBeInTheDocument();
    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });
});

describe('the verification link a mailbox owner clicks', () => {
  it('still reaches the page with its token when no session is signed in', async () => {
    authState.isAuthenticated = false;
    authState.user = null;

    const router = renderAt(`?token=${TOKEN}`);

    expect(await screen.findByText(VERIFY_PAGE)).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ token: TOKEN });
    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('still reaches the page with its token for an anonymous visitor', async () => {
    authState.user = { isAnonymous: true };

    const router = renderAt(`?token=${TOKEN}`);

    expect(await screen.findByText(VERIFY_PAGE)).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ token: TOKEN });
    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });
});
