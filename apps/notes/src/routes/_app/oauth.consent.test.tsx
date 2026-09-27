import i18n from '@/lib/i18n';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import type { AuthUserProfile } from '@jovandyaz/auth-react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { ApiClientError } from '@knowtis/api-client';
import type { OauthInteractionDetails } from '@knowtis/data-access-oauth';
import { EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import { createAuthApiMock, createAuthWrapper } from '../../test/auth-harness';
import { Route } from './oauth.consent';

const { getInteraction, confirm, abort } = vi.hoisted(() => ({
  getInteraction: vi.fn(),
  confirm: vi.fn(),
  abort: vi.fn(),
}));

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  oauthApi: { getInteraction, confirm, abort },
}));

const ACCOUNT: AuthUserProfile = {
  id: 'user-1',
  email: 'jane@knowtis.app',
  name: 'Jane Doe',
  avatarUrl: null,
  emailVerifiedAt: null,
};

const INTERACTION: OauthInteractionDetails = {
  clientId: 'https://claude.ai',
  clientName: 'Claude',
  redirectHost: 'claude.ai',
  scopes: ['notes:read'],
  isCimdClient: true,
};

function renderConsent() {
  vi.spyOn(Route, 'useSearch').mockReturnValue({ uid: 'UID' });
  const Consent = Route.options.component;
  if (!Consent) {
    throw new Error('The consent route must render a component');
  }
  render(<Consent />, {
    wrapper: createAuthWrapper(createAuthApiMock(), { user: ACCOUNT }),
  });
}

async function approve() {
  await userEvent.click(
    await screen.findByRole('button', { name: /approve/i })
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  useVerifyEmailStore.setState({ isOpen: false, source: 'inApp' });
  getInteraction.mockResolvedValue(INTERACTION);
});

describe('OAuth consent route', () => {
  it('offers email verification when approval is refused for an unverified email', async () => {
    confirm.mockRejectedValue(
      new ApiClientError(
        'Verify your email address to connect apps',
        403,
        EMAIL_NOT_VERIFIED_CODE
      )
    );
    renderConsent();

    await approve();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Verify your email address to connect apps, then approve again.'
    );
    expect(useVerifyEmailStore.getState()).toMatchObject({
      isOpen: true,
      source: 'inApp',
    });
  });

  it('leaves any other approval failure to the consent card', async () => {
    confirm.mockRejectedValue(new ApiClientError('Server Error', 503));
    renderConsent();

    await approve();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /complete your request/i
    );
    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });
});
