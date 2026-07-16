import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { AuditPage } from '../AuditPage';

const useAuditLogMock = vi.fn();

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAuditLog: () => useAuditLogMock(),
  };
});

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AuditPage />
    </QueryClientProvider>
  );
}

describe('AuditPage', () => {
  beforeEach(() => {
    useAuditLogMock.mockReset();
  });

  it('renders the audit table with data', async () => {
    useAuditLogMock.mockReturnValue({
      data: {
        items: [
          {
            id: '3b241101-e2bb-4255-8caf-4136c566a962',
            actorId: '5b241101-e2bb-4255-8caf-4136c566a963',
            actorEmail: 'ada@knowtis.app',
            action: 'user.role.updated',
            targetType: 'user',
            targetId: '7b241101-e2bb-4255-8caf-4136c566a964',
            before: { role: 'user' },
            after: { role: 'admin' },
            createdAt: new Date('2026-07-01'),
          },
          {
            id: '4b241101-e2bb-4255-8caf-4136c566a965',
            actorId: '6b241101-e2bb-4255-8caf-4136c566a966',
            actorEmail: null,
            action: 'flag.upserted',
            targetType: 'feature_flag',
            targetId: null,
            before: null,
            after: null,
            createdAt: new Date('2026-07-02'),
          },
          {
            id: '8b241101-e2bb-4255-8caf-4136c566a967',
            actorId: '5b241101-e2bb-4255-8caf-4136c566a963',
            actorEmail: 'grace@knowtis.app',
            action: 'flag.deleted',
            targetType: 'feature_flag',
            targetId: 'beta_mode',
            before: { enabled: true },
            after: null,
            createdAt: new Date('2026-07-03'),
          },
        ],
        total: 3,
        page: 1,
        limit: 25,
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });

    renderPage();
    expect(
      screen.getByRole('heading', { name: /audit log/i })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('ada@knowtis.app')).toBeInTheDocument()
    );
    expect(screen.getByText('user.role.updated')).toBeInTheDocument();
    expect(
      screen.getByText('6b241101-e2bb-4255-8caf-4136c566a966')
    ).toBeInTheDocument();

    expect(
      screen.getByText('user: 7b241101-e2bb-4255-8caf-4136c566a964')
    ).toBeInTheDocument();
    expect(screen.getByText('feature_flag')).toBeInTheDocument();
    expect(screen.getByText('feature_flag: beta_mode')).toBeInTheDocument();

    expect(screen.getByText('role: user → admin')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('enabled: true → —')).toBeInTheDocument();
  });

  it('opens the detail drawer with the field diff when a row is clicked', async () => {
    useAuditLogMock.mockReturnValue({
      data: {
        items: [
          {
            id: '3b241101-e2bb-4255-8caf-4136c566a962',
            actorId: '5b241101-e2bb-4255-8caf-4136c566a963',
            actorEmail: 'ada@knowtis.app',
            action: 'user.role_changed',
            targetType: 'user',
            targetId: 'u1',
            before: { role: 'user' },
            after: { role: 'admin' },
            createdAt: new Date('2026-07-01'),
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();
    await userEvent.click(screen.getByText('ada@knowtis.app'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('user.role_changed')).toBeInTheDocument();
    expect(within(dialog).getByText('user')).toBeInTheDocument();
    expect(within(dialog).getByText('admin')).toBeInTheDocument();
    expect(within(dialog).getByText('Full JSON')).toBeInTheDocument();
  });

  it('shows an error state and retries the failed query', async () => {
    const refetch = vi.fn();
    useAuditLogMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch,
    });

    renderPage();

    expect(screen.getByText('Could not load audit log.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
