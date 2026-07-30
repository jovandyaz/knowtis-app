import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { AiConfigStatusHeader } from '../AiConfigStatusHeader';

const { useAiHealthMock, useGlobalAiUsageMock, upsertMutate } = vi.hoisted(
  () => ({
    useAiHealthMock: vi.fn(),
    useGlobalAiUsageMock: vi.fn(),
    upsertMutate: vi.fn(),
  })
);

const useFeatureFlagsMock = vi.fn();

vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlags: () => useFeatureFlagsMock(),
}));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAiHealth: () => useAiHealthMock(),
    useGlobalAiUsage: () => useGlobalAiUsageMock(),
    useUpsertFeatureFlag: vi
      .fn()
      .mockReturnValue({ mutate: upsertMutate, isPending: false }),
  };
});

const HEALTHY = {
  data: {
    providers: {
      openrouter: {
        configured: true,
        cooling: false,
        failureCount: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        cooldownEndsAt: null,
      },
    },
  },
  isLoading: false,
  isError: false,
};

describe('AiConfigStatusHeader', () => {
  beforeEach(() => {
    upsertMutate.mockReset();
    useFeatureFlagsMock.mockReturnValue({
      data: [
        {
          key: 'ai_enabled',
          enabled: true,
          description: null,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
    });
    useAiHealthMock.mockReturnValue(HEALTHY);
    useGlobalAiUsageMock.mockReturnValue({
      data: {
        totalInputTokens: 1,
        totalOutputTokens: 2,
        totalCostUsd: 3.1,
        requestCount: 4,
      },
      isLoading: false,
      isError: false,
    });
  });

  it('shows the master toggle, model, healthy state, and spend', () => {
    render(<AiConfigStatusHeader defaultModel="openrouter:z-ai/glm-5.2" />);

    expect(screen.getByRole('switch', { name: 'AI enabled' })).toBeChecked();
    expect(screen.getByText('openrouter:z-ai/glm-5.2')).toBeInTheDocument();
    expect(screen.getByText('Providers healthy')).toBeInTheDocument();
    expect(screen.getByText('$3.10 today')).toBeInTheDocument();
  });

  it('lists cooling providers when the chain breaker is active', () => {
    useAiHealthMock.mockReturnValue({
      ...HEALTHY,
      data: {
        providers: {
          openrouter: {
            ...HEALTHY.data.providers.openrouter,
            cooling: true,
          },
        },
      },
    });

    render(<AiConfigStatusHeader defaultModel={null} />);
    expect(screen.getByText('Cooling: openrouter')).toBeInTheDocument();
  });

  it('treats a missing ai_enabled row as off and toggles it on', async () => {
    useFeatureFlagsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<AiConfigStatusHeader defaultModel={null} />);
    const master = screen.getByRole('switch', { name: 'AI enabled' });
    expect(master).not.toBeChecked();

    await userEvent.click(master);
    expect(upsertMutate).toHaveBeenCalledWith({
      key: 'ai_enabled',
      enabled: true,
    });
  });
});
