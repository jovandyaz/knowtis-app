import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { UsersPage } from '../UsersPage';

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAdminUsers: vi.fn().mockReturnValue({
      data: {
        items: [
          {
            id: '3b241101-e2bb-4255-8caf-4136c566a962',
            email: 'ada@knowtis.app',
            name: 'Ada',
            avatarUrl: null,
            role: 'admin',
            provider: 'local',
            isAnonymous: false,
            createdAt: new Date('2026-07-01'),
            emailVerifiedAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
      },
      isLoading: false,
      isSuccess: true,
    }),
    useUpdateUserRole: vi
      .fn()
      .mockReturnValue({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ id: 'someone-else', email: 'me@x.y', role: 'admin' }),
}));

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>
  );
}

describe('UsersPage', () => {
  it('renders the users table with data', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /users/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('ada@knowtis.app')).toBeInTheDocument()
    );
  });
});
