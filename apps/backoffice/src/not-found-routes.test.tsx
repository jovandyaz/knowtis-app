import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';

import { authStore, tokenStorage } from '@/auth/setup';
import { ROUTES } from '@/config/routes.config';
import { stubDesktopViewport } from '@/test/media-query';
import { USER_ROLE } from '@jovandyaz/auth';
import type { AuthUserProfile } from '@jovandyaz/auth-react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routeTree } from './routeTree.gen';

const RETIRED_BOOKMARK = '/feature-flags';
const UNKNOWN_SECTION_PAGE = '/users/unknown';
const NOT_FOUND_TITLE = 'Page not found';
const BACK_TO_DASHBOARD = 'Back to dashboard';

const ADMIN: AuthUserProfile = {
  id: 'admin-1',
  email: 'ada@knowtis.app',
  name: 'Ada',
  avatarUrl: null,
  role: USER_ROLE.ADMIN,
};

const { getProfile } = vi.hoisted(() => ({ getProfile: vi.fn() }));

vi.mock('@/auth/auth-api-adapter', () => ({
  createBackofficeAuthApi: () => ({
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    getProfile,
  }),
}));

async function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

function signInAs(user: AuthUserProfile) {
  tokenStorage.setAccessToken('access-token');
  authStore.getState().setUser(user);
  getProfile.mockResolvedValue(user);
}

describe('unknown URLs', () => {
  beforeEach(() => {
    authStore.getState().logout();
    stubDesktopViewport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('for an admin', () => {
    beforeEach(() => {
      signInAs(ADMIN);
    });

    it('renders a retired top-level bookmark inside the app shell', async () => {
      await renderAt(RETIRED_BOOKMARK);

      const main = await screen.findByRole('main');
      expect(
        within(main).getByRole('heading', { name: NOT_FOUND_TITLE })
      ).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('renders an unknown page under a known section inside the app shell', async () => {
      await renderAt(UNKNOWN_SECTION_PAGE);

      const main = await screen.findByRole('main');
      expect(
        within(main).getByRole('heading', { name: NOT_FOUND_TITLE })
      ).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('links back to the dashboard', async () => {
      await renderAt(RETIRED_BOOKMARK);

      await userEvent.click(
        await screen.findByRole('link', { name: BACK_TO_DASHBOARD })
      );

      expect(
        await screen.findByRole('heading', { name: 'Overview' })
      ).toBeInTheDocument();
    });
  });

  it.each([
    ['a signed-out visitor', () => undefined],
    ['a non-admin', () => signInAs({ ...ADMIN, role: USER_ROLE.USER })],
  ])('keeps the admin shell away from %s', async (_viewer, arrange) => {
    arrange();

    await renderAt(RETIRED_BOOKMARK);

    expect(
      await screen.findByRole('heading', { name: NOT_FOUND_TITLE })
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(
      screen.getByRole('link', { name: BACK_TO_DASHBOARD })
    ).toHaveAttribute('href', ROUTES.ROOT);
  });
});
