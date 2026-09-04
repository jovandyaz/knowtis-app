import { StrictMode, type ComponentType, type ReactNode } from 'react';

import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import {
  createAuthApiMock,
  createAuthWrapper,
  HARNESS_PROFILE,
} from '@/test/auth-harness';
import type { AuthUserProfile } from '@jovandyaz/auth-react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { VerifyEmailPage } from './VerifyEmailPage';

const TOKEN = 'secret-token';
const VERIFY_EMAIL_PATH = '/verify-email';

const verifyEmail = vi.fn<(token: string) => Promise<void>>();
const resendVerification = vi.fn<() => Promise<void>>();
let currentUser: AuthUserProfile | undefined;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

interface VerifyEmailSearch {
  token?: string;
}

type Harness = ComponentType<{ children: ReactNode }>;

let destroyHistory: (() => void) | undefined;

function createHarness(): Harness {
  return createAuthWrapper(
    createAuthApiMock({ verifyEmail, resendVerification }),
    currentUser ? { user: currentUser } : {}
  );
}

function renderAt(
  search: string,
  { inMemory = false, Harness = createHarness() } = {}
) {
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

  const view = render(
    <StrictMode>
      <Harness>
        <RouterProvider router={router} />
      </Harness>
    </StrictMode>
  );
  return { router, unmount: view.unmount };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyEmail.mockResolvedValue(undefined);
  resendVerification.mockResolvedValue(undefined);
  currentUser = HARNESS_PROFILE;
});

afterEach(() => {
  destroyHistory?.();
  destroyHistory = undefined;
});

describe('VerifyEmailPage', () => {
  it('redeems the token the email link carried exactly once', async () => {
    renderAt(`?token=${TOKEN}`);

    expect(
      await screen.findByText('verifyEmail.verifiedTitle')
    ).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledTimes(1);
    expect(verifyEmail).toHaveBeenCalledWith(TOKEN);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('says it is verifying while the redemption is in flight', async () => {
    let settle!: () => void;
    verifyEmail.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      })
    );

    renderAt(`?token=${TOKEN}`);

    expect(
      await screen.findByText('verifyEmail.verifyingTitle')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('verifyEmail.verifiedTitle')
    ).not.toBeInTheDocument();

    settle();

    expect(
      await screen.findByText('verifyEmail.verifiedTitle')
    ).toBeInTheDocument();
  });

  it('reaches the failure outcome from one refused request', async () => {
    verifyEmail.mockRejectedValue(new ApiClientError('Expired', 400));

    renderAt(`?token=${TOKEN}`);

    expect(
      await screen.findByText('verifyEmail.invalidOrExpired')
    ).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the remembered outcome on a second visit instead of re-posting', async () => {
    const Harness = createHarness();
    const first = renderAt(`?token=${TOKEN}`, { Harness });
    expect(
      await screen.findByText('verifyEmail.verifiedTitle')
    ).toBeInTheDocument();
    first.unmount();
    destroyHistory?.();

    renderAt(`?token=${TOKEN}`, { Harness });

    expect(
      await screen.findByText('verifyEmail.verifiedTitle')
    ).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('takes the token out of the URL once the attempt has settled', async () => {
    const { router } = renderAt(`?token=${TOKEN}`);

    await waitFor(() =>
      expect(router.state.location.searchStr).not.toContain(TOKEN)
    );
    expect(router.state.location.pathname).toBe(VERIFY_EMAIL_PATH);
    expect(window.location.search).not.toContain(TOKEN);
  });

  it('scrubs through the router, not behind its back', async () => {
    const { router } = renderAt(`?token=${TOKEN}`, { inMemory: true });

    await waitFor(() =>
      expect(router.state.location.searchStr).not.toContain(TOKEN)
    );
    expect(router.state.location.pathname).toBe(VERIFY_EMAIL_PATH);
  });

  it('replaces the token entry instead of stacking a clean one on top of it', async () => {
    const { router } = renderAt(`?token=${TOKEN}`, { inMemory: true });

    await waitFor(() =>
      expect(router.state.location.searchStr).not.toContain(TOKEN)
    );

    // The location alone cannot see this: a pushed scrub also reads clean, and
    // leaves the token one Back away behind a page that still reads verified.
    expect(router.history.length).toBe(1);
    expect(router.state.location.pathname).toBe(VERIFY_EMAIL_PATH);
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

  it('explains the sign-out it just caused, next to the way back in', async () => {
    renderAt(`?token=${TOKEN}`);

    expect(
      await screen.findByText('verifyEmail.verifiedDesc')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'login.button' })).toHaveAttribute(
      'href',
      '/login'
    );
  });

  it('keeps showing the failure outcome after the URL is scrubbed', async () => {
    verifyEmail.mockRejectedValue(new Error('nope'));

    renderAt(`?token=${TOKEN}`);

    await waitFor(() => expect(window.location.search).not.toContain(TOKEN));
    expect(
      await screen.findByText('verifyEmail.failedTitle')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('verifyEmail.invalidLink')
    ).not.toBeInTheDocument();
  });

  it('names the wait when the link endpoint throttles the attempt', async () => {
    verifyEmail.mockRejectedValue(new ApiClientError('Too many requests', 429));

    renderAt(`?token=${TOKEN}`);

    expect(
      await screen.findByText('verifyEmail.codeThrottled')
    ).toBeInTheDocument();
  });

  it('still calls a bare visit an invalid link', async () => {
    renderAt('');

    expect(
      await screen.findByText('verifyEmail.invalidLink')
    ).toBeInTheDocument();
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});

describe('the resend offer on a failed verification', () => {
  const RESEND_BUTTON = 'verifyEmail.resendButton';

  beforeEach(() => {
    verifyEmail.mockRejectedValue(new Error('nope'));
  });

  it('stays away from an anonymous visitor the server always refuses', async () => {
    currentUser = { ...HARNESS_PROFILE, isAnonymous: true };

    renderAt(`?token=${TOKEN}`);

    expect(
      await screen.findByText('verifyEmail.failedTitle')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: RESEND_BUTTON })
    ).not.toBeInTheDocument();
  });

  it('stays away from a visitor with no session to resend against', async () => {
    currentUser = undefined;

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

  it('holds the next send for the cooldown, like every other resend', async () => {
    renderAt(`?token=${TOKEN}`);

    await userEvent.click(
      await screen.findByRole('button', { name: RESEND_BUTTON })
    );

    expect(
      await screen.findByRole('button', {
        name: 'verifyEmail.resendCountdown',
      })
    ).toBeDisabled();
  });
});
