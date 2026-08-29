import { useAuthUser, type AuthUserProfile } from '@jovandyaz/auth-react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAuthApiMock,
  createAuthWrapper,
} from '../../../test/auth-harness';
import { ProfileSection } from './ProfileSection';

const VERIFIED_AT = '2026-08-01T10:00:00.000Z';

const VERIFIED_USER: AuthUserProfile = {
  id: 'user-1',
  email: 'jane@knowtis.app',
  name: 'Jane Doe',
  avatarUrl: null,
  emailVerifiedAt: VERIFIED_AT,
  locale: 'es',
};

const mutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@knowtis/data-access-users', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUpdateProfile: () => ({ mutate, isPending: false }),
}));

const NO_VERIFICATION = 'no-verification';

function VerificationProbe() {
  const user = useAuthUser();
  return <span>{user?.emailVerifiedAt ?? NO_VERIFICATION}</span>;
}

describe('ProfileSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the verification the API response does not carry', async () => {
    mutate.mockImplementation((_input, { onSuccess }) => {
      onSuccess({
        user: {
          id: VERIFIED_USER.id,
          email: VERIFIED_USER.email,
          name: 'Jane Renamed',
          avatarUrl: null,
        },
      });
    });

    render(
      <>
        <ProfileSection />
        <VerificationProbe />
      </>,
      {
        wrapper: createAuthWrapper(createAuthApiMock(), {
          user: VERIFIED_USER,
        }),
      }
    );

    await userEvent.clear(screen.getByLabelText('profile.nameLabel'));
    await userEvent.type(
      screen.getByLabelText('profile.nameLabel'),
      'Jane Renamed'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'profile.saveChanges' })
    );

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(screen.getByText(VERIFIED_AT)).toBeInTheDocument();
    expect(screen.queryByText(NO_VERIFICATION)).not.toBeInTheDocument();
  });
});
