import i18n from '@/lib/i18n';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { useProfile, type AuthUserProfile } from '@jovandyaz/auth-react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthApiMock, createAuthWrapper } from '../../test/auth-harness';
import { VerifyEmailBanner } from './VerifyEmailBanner';

const DISMISSED_KEY = 'verify-email-banner-dismissed';

const CTA = 'Verify now';
const DISMISS = 'Dismiss';

const UNVERIFIED: AuthUserProfile = {
  id: 'user-1',
  email: 'jane@knowtis.app',
  name: 'Jane Doe',
  avatarUrl: null,
  emailVerifiedAt: null,
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  sessionStorage.clear();
  useVerifyEmailStore.setState({ isOpen: false });
});

const PROFILE_RESOLVED = 'profile-resolved';
const PROFILE_PENDING = 'profile-pending';

/**
 * A second reader of the same query, so a "the banner is absent" assertion can
 * wait for the profile to have actually landed instead of racing it.
 */
function ProfileProbe() {
  const { data } = useProfile();
  return <span>{data ? PROFILE_RESOLVED : PROFILE_PENDING}</span>;
}

function renderBanner(getProfile: () => Promise<AuthUserProfile>) {
  const api = createAuthApiMock({ getProfile: vi.fn(getProfile) });
  render(
    <>
      <VerifyEmailBanner />
      <ProfileProbe />
    </>,
    { wrapper: createAuthWrapper(api, { user: UNVERIFIED }) }
  );
  return api;
}

function resolving(profile: AuthUserProfile) {
  return () => Promise.resolve(profile);
}

describe('VerifyEmailBanner', () => {
  it('asks an unverified account to verify', async () => {
    renderBanner(resolving(UNVERIFIED));

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('says nothing until a profile has actually resolved', async () => {
    renderBanner(() => new Promise(() => undefined));

    expect(await screen.findByText(PROFILE_PENDING)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays away once the account is verified', async () => {
    renderBanner(
      resolving({ ...UNVERIFIED, emailVerifiedAt: '2026-08-01T10:00:00.000Z' })
    );

    expect(await screen.findByText(PROFILE_RESOLVED)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('never spends a profile fetch on an anonymous visitor', () => {
    const api = createAuthApiMock({
      getProfile: vi.fn(resolving(UNVERIFIED)),
    });
    render(<VerifyEmailBanner />, {
      wrapper: createAuthWrapper(api, {
        user: { ...UNVERIFIED, isAnonymous: true },
      }),
    });

    expect(api.getProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('opens the verification dialog from its call to action', async () => {
    renderBanner(resolving(UNVERIFIED));
    await screen.findByRole('status');

    await userEvent.click(screen.getByRole('button', { name: CTA }));

    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('goes away when dismissed, and remembers that for the session', async () => {
    renderBanner(resolving(UNVERIFIED));
    await screen.findByRole('status');

    await userEvent.click(screen.getByRole('button', { name: DISMISS }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(DISMISSED_KEY)).not.toBe(null);
  });

  it('stays dismissed for the rest of the session', async () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    renderBanner(resolving(UNVERIFIED));

    expect(await screen.findByText(PROFILE_RESOLVED)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('survives a storage that refuses to be read', async () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation((key: string) => {
        if (key === DISMISSED_KEY) {
          throw new Error('storage disabled');
        }
        return null;
      });

    renderBanner(resolving(UNVERIFIED));

    expect(await screen.findByRole('status')).toBeInTheDocument();
    getItem.mockRestore();
  });
});
