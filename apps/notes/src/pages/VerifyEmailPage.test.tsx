import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VerifyEmailPage } from './VerifyEmailPage';

const TOKEN = 'secret-token';
const VERIFY_EMAIL_PATH = '/verify-email';

const verifyMutate = vi.fn();
let currentUser: { isAnonymous?: boolean } | null = null;
const verifyState = {
  isPending: false,
  isSuccess: true,
  isError: false,
  error: null as Error | null,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => currentUser,
  useResendVerification: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  }),
  useVerifyEmail: () => ({ mutate: verifyMutate, ...verifyState }),
}));

interface VerifyEmailSearch {
  token?: string;
}

let destroyHistory: (() => void) | undefined;

function renderAt(search: string, { inMemory = false } = {}) {
  window.history.replaceState({}, '', `${VERIFY_EMAIL_PATH}${search}`);

  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const verifyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: VERIFY_EMAIL_PATH,
    validateSearch: (raw: Record<string, unknown>): VerifyEmailSearch =>
      typeof raw.token === 'string' ? { token: raw.token } : {},
    component: VerifyEmailPage,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    validateSearch: (raw: Record<string, unknown>) => raw,
    component: () => <p>login</p>,
  });

  const history = inMemory
    ? createMemoryHistory({
        initialEntries: [`${VERIFY_EMAIL_PATH}${search}`],
      })
    : createBrowserHistory();
  destroyHistory = () => history.destroy();
  const router = createRouter({
    routeTree: rootRoute.addChildren([verifyRoute, loginRoute]),
    history,
  });

  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyState.isPending = false;
  verifyState.isSuccess = true;
  verifyState.isError = false;
  verifyState.error = null;
  verifyMutate.mockImplementation((_token, { onSettled }) => onSettled());
  currentUser = { isAnonymous: false };
});

afterEach(() => {
  destroyHistory?.();
  destroyHistory = undefined;
});

describe('VerifyEmailPage', () => {
  it('verifies with the token the email link carried', async () => {
    renderAt(`?token=${TOKEN}`);

    await waitFor(() => expect(verifyMutate).toHaveBeenCalled());
    expect(verifyMutate.mock.calls[0][0]).toBe(TOKEN);
  });

  it('takes the token out of the URL once the attempt has settled', async () => {
    const router = renderAt(`?token=${TOKEN}`);

    await waitFor(() =>
      expect(router.state.location.searchStr).not.toContain(TOKEN)
    );
    expect(window.location.search).not.toContain(TOKEN);
  });

  it('scrubs through the router, not behind its back', async () => {
    const router = renderAt(`?token=${TOKEN}`, { inMemory: true });

    await waitFor(() =>
      expect(router.state.location.searchStr).not.toContain(TOKEN)
    );
  });

  it('replaces the token entry instead of stacking a clean one on top of it', async () => {
    const router = renderAt(`?token=${TOKEN}`, { inMemory: true });

    await waitFor(() =>
      expect(router.state.location.searchStr).not.toContain(TOKEN)
    );

    // The location alone cannot see this: a pushed scrub also reads clean, and
    // leaves the token one Back away with `hasAttempted` still hiding the leak.
    expect(router.history.length).toBe(1);

    router.history.back();

    expect(router.history.location.href).not.toContain(TOKEN);
  });

  it('keeps showing the success outcome after the URL is scrubbed', async () => {
    renderAt(`?token=${TOKEN}`);

    await waitFor(() => expect(window.location.search).not.toContain(TOKEN));
    expect(
      await screen.findByText('verifyEmail.verifiedTitle')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('verifyEmail.invalidLink')
    ).not.toBeInTheDocument();
  });

  it('keeps showing the failure outcome after the URL is scrubbed', async () => {
    verifyState.isSuccess = false;
    verifyState.isError = true;
    verifyState.error = new Error('nope');

    renderAt(`?token=${TOKEN}`);

    await waitFor(() => expect(window.location.search).not.toContain(TOKEN));
    expect(
      await screen.findByText('verifyEmail.failedTitle')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('verifyEmail.invalidLink')
    ).not.toBeInTheDocument();
  });

  it('still calls a bare visit an invalid link', async () => {
    renderAt('');

    expect(
      await screen.findByText('verifyEmail.invalidLink')
    ).toBeInTheDocument();
    expect(verifyMutate).not.toHaveBeenCalled();
  });
});

describe('the resend offer on a failed verification', () => {
  const RESEND_BUTTON = 'verifyEmail.resendButton';

  beforeEach(() => {
    verifyState.isSuccess = false;
    verifyState.isError = true;
    verifyState.error = new Error('nope');
  });

  it('stays away from an anonymous visitor the server always refuses', async () => {
    currentUser = { isAnonymous: true };

    renderAt(`?token=${TOKEN}`);

    expect(
      await screen.findByText('verifyEmail.failedTitle')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: RESEND_BUTTON })
    ).not.toBeInTheDocument();
  });

  it('stays away from a visitor with no session to resend against', async () => {
    currentUser = null;

    renderAt(`?token=${TOKEN}`);

    expect(
      await screen.findByText('verifyEmail.failedTitle')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: RESEND_BUTTON })
    ).not.toBeInTheDocument();
  });

  it('reaches the one audience the server would send to', async () => {
    renderAt(`?token=${TOKEN}`);

    expect(
      await screen.findByRole('button', { name: RESEND_BUTTON })
    ).toBeInTheDocument();
  });
});
