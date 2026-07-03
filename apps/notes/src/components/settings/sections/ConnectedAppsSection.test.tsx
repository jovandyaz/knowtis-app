import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { ConnectedAppsSection } from './ConnectedAppsSection';

const useOauthGrants = vi.fn();
const revokeMutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@knowtis/data-access-oauth', async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  useOauthGrants: () => useOauthGrants(),
  useRevokeGrant: () => ({ mutate: revokeMutate, isPending: false }),
}));

function grant(overrides: Record<string, unknown> = {}) {
  return {
    grantId: 'grant-1',
    clientId: 'https://claude.ai',
    clientName: 'Claude',
    scopes: ['notes:read', 'notes:write'],
    createdAt: '2026-07-02T12:00:00.000Z',
    ...overrides,
  };
}

describe('ConnectedAppsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the grants request 404s (OAuth flag off)', () => {
    useOauthGrants.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiClientError('Not Found', 404),
    });

    const { container } = render(<ConnectedAppsSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows an error state on a non-404 failure (5xx/network)', () => {
    useOauthGrants.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiClientError('Server Error', 500),
    });

    render(<ConnectedAppsSection />);

    expect(screen.getByText('connectedApps.errorTitle')).toBeInTheDocument();
    expect(
      screen.getByText('connectedApps.errorDescription')
    ).toBeInTheDocument();
  });

  it('renders an empty state when there are no connected apps', () => {
    useOauthGrants.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<ConnectedAppsSection />);

    expect(screen.getByText('connectedApps.emptyTitle')).toBeInTheDocument();
  });

  it('lists connected apps with their granted scopes', () => {
    useOauthGrants.mockReturnValue({
      data: [grant()],
      isLoading: false,
      isError: false,
    });

    render(<ConnectedAppsSection />);

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('oauth.scopes.notesRead')).toBeInTheDocument();
    expect(screen.getByText('oauth.scopes.notesWrite')).toBeInTheDocument();
  });

  it('falls back to the client id host when no client name is stored', () => {
    useOauthGrants.mockReturnValue({
      data: [grant({ clientName: null, clientId: 'https://cursor.sh/cimd' })],
      isLoading: false,
      isError: false,
    });

    render(<ConnectedAppsSection />);

    expect(screen.getByText('cursor.sh')).toBeInTheDocument();
  });

  it('opens the revoke confirmation dialog for the selected app', async () => {
    useOauthGrants.mockReturnValue({
      data: [grant()],
      isLoading: false,
      isError: false,
    });

    render(<ConnectedAppsSection />);
    await userEvent.click(
      screen.getByRole('button', { name: 'connectedApps.revoke' })
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('connectedApps.revokeConfirm')).toBeInTheDocument();
  });
});
