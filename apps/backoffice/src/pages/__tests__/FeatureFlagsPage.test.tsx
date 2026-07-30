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

const FLAGS = [
  {
    key: 'voice_notes_enabled',
    enabled: false,
    description: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    key: 'ai_enabled',
    enabled: true,
    description: 'Master AI switch',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    key: 'some_adhoc_flag',
    enabled: true,
    description: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
];

describe('FeatureFlagsPage', () => {
  beforeEach(() => {
    useFeatureFlagsMock.mockReset();
    useFeatureFlagsMock.mockReturnValue({
      data: FLAGS,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('groups product flags by type and leaves AI flags out', () => {
    render(<FeatureFlagsPage />);

    expect(
      screen.getByRole('heading', { name: 'Release' })
    ).toBeInTheDocument();
    expect(screen.getByText('Voice notes')).toBeInTheDocument();
    expect(screen.queryByText('ai_enabled')).not.toBeInTheDocument();
  });

  it('puts uncatalogued flags under Other', () => {
    render(<FeatureFlagsPage />);

    expect(screen.getByRole('heading', { name: 'Other' })).toBeInTheDocument();
    expect(screen.getByText('some_adhoc_flag')).toBeInTheDocument();
  });

  it('shows the empty state when no product flags exist', () => {
    useFeatureFlagsMock.mockReturnValue({
      data: [FLAGS[1]],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FeatureFlagsPage />);
    expect(screen.getByText('No flags')).toBeInTheDocument();
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
