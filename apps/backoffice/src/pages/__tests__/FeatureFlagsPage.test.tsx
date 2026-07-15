import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { FeatureFlagsPage } from '../FeatureFlagsPage';

const useFeatureFlagsMock = vi.fn();

vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlags: () => useFeatureFlagsMock(),
}));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useUpsertFeatureFlag: vi
      .fn()
      .mockReturnValue({ mutate: vi.fn(), isPending: false }),
  };
});

describe('FeatureFlagsPage', () => {
  beforeEach(() => {
    useFeatureFlagsMock.mockReset();
  });

  it('renders flags with their toggle state', () => {
    useFeatureFlagsMock.mockReturnValue({
      data: [
        {
          key: 'ai_enabled',
          enabled: true,
          description: 'Master AI switch',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FeatureFlagsPage />);
    expect(
      screen.getByRole('heading', { name: /feature flags/i })
    ).toBeInTheDocument();
    expect(screen.getByText('ai_enabled')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /ai_enabled/i })).toBeChecked();
  });

  it('shows an error state and retries the failed query', async () => {
    const refetch = vi.fn();
    useFeatureFlagsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch,
    });

    render(<FeatureFlagsPage />);

    expect(
      screen.getByText('Could not load feature flags.')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
