import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import { FEATURE_FLAG_KEYS, type FeatureFlagDto } from '@knowtis/shared-types';

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

const PRODUCT_FLAG: FeatureFlagDto = {
  key: FEATURE_FLAG_KEYS.VOICE_NOTES_ENABLED,
  enabled: false,
  description: null,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const AI_FLAG: FeatureFlagDto = {
  key: FEATURE_FLAG_KEYS.AI_ENABLED,
  enabled: true,
  description: 'Master AI switch',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const UNCATALOGUED_FLAG: FeatureFlagDto = {
  key: 'some_adhoc_flag',
  enabled: true,
  description: null,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('FeatureFlagsPage', () => {
  beforeEach(() => {
    useFeatureFlagsMock.mockReset();
    useFeatureFlagsMock.mockReturnValue({
      data: [PRODUCT_FLAG, AI_FLAG, UNCATALOGUED_FLAG],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('groups product flags by type and leaves AI flags out', () => {
    render(<FeatureFlagsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /feature flags/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Release' })
    ).toBeInTheDocument();
    expect(screen.getByText('Voice notes')).toBeInTheDocument();
    expect(screen.queryByText('AI enabled')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Operations' })
    ).not.toBeInTheDocument();
  });

  it('puts uncatalogued flags under Other', () => {
    render(<FeatureFlagsPage />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Other' })
    ).toBeInTheDocument();
    expect(screen.getByText('some_adhoc_flag')).toBeInTheDocument();
  });

  it('shows the empty state when no product flags exist', () => {
    useFeatureFlagsMock.mockReturnValue({
      data: [AI_FLAG],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FeatureFlagsPage />);

    expect(screen.getByText('No product flags')).toBeInTheDocument();
    expect(
      screen.getByText(
        'AI controls live in AI Config. New product flags appear once created via the API.'
      )
    ).toBeInTheDocument();
  });

  it('shows the loading indicator while flags load', () => {
    useFeatureFlagsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FeatureFlagsPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('No product flags')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
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
