import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountSection } from './AccountSection';

const navigateSpy = vi.fn();
const closeSpy = vi.fn();
const redirectSpy = vi.fn();

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: { close: () => void }) => unknown) =>
    sel({ close: closeSpy }),
}));
vi.mock('@/auth/redirect-to-login', () => ({
  redirectToLoginWithReload: () => redirectSpy(),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useLogout: () => ({
    mutate: (_vars: unknown, opts: { onSuccess: () => void }) =>
      opts.onSuccess(),
  }),
}));

describe('AccountSection logout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects via a full reload (not SPA nav) so no in-memory session state leaks to the next user', async () => {
    render(<AccountSection />);

    await userEvent.click(screen.getByRole('button', { name: /logOut/i }));

    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
