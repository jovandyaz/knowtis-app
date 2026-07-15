import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { FeatureFlagsPage } from '../FeatureFlagsPage';

vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlags: vi.fn().mockReturnValue({
    data: [
      {
        key: 'ai_enabled',
        enabled: true,
        description: 'Master AI switch',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
  }),
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
  it('renders flags with their toggle state', () => {
    render(<FeatureFlagsPage />);
    expect(
      screen.getByRole('heading', { name: /feature flags/i })
    ).toBeInTheDocument();
    expect(screen.getByText('ai_enabled')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /ai_enabled/i })).toBeChecked();
  });
});
