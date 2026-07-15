import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { AiMetricsPage } from '../AiMetricsPage';

const useGlobalAiUsageMock = vi.fn();
const useGlobalAiMetricsMock = vi.fn();

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useGlobalAiUsage: () => useGlobalAiUsageMock(),
    useGlobalAiMetrics: () => useGlobalAiMetricsMock(),
  };
});

function mockSuccess() {
  useGlobalAiUsageMock.mockReturnValue({
    data: {
      totalInputTokens: 1000,
      totalOutputTokens: 2000,
      totalCostUsd: 0.42,
      requestCount: 12,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  useGlobalAiMetricsMock.mockReturnValue({
    data: {
      totalRequests: 12,
      totalInputTokens: 1000,
      totalOutputTokens: 2000,
      totalCostUsd: 0.42,
      byAction: { summarize: { requests: 5, tokens: 800, costUsd: 0.2 } },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

describe('AiMetricsPage', () => {
  beforeEach(() => {
    useGlobalAiUsageMock.mockReset();
    useGlobalAiMetricsMock.mockReset();
  });

  it('renders usage cards and the per-action breakdown', () => {
    mockSuccess();

    render(<AiMetricsPage />);
    expect(
      screen.getByRole('heading', { name: /ai metrics/i })
    ).toBeInTheDocument();
    expect(screen.getByText('$0.4200')).toBeInTheDocument();
    expect(screen.getByText('summarize')).toBeInTheDocument();
  });

  it('shows an empty state when no actions were recorded for the period', () => {
    mockSuccess();
    useGlobalAiMetricsMock.mockReturnValue({
      data: {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        byAction: {},
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AiMetricsPage />);
    expect(screen.getByText('No activity')).toBeInTheDocument();
  });

  it('shows an error state and retries the failed usage query', async () => {
    const refetch = vi.fn();
    useGlobalAiUsageMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch,
    });
    useGlobalAiMetricsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AiMetricsPage />);

    expect(
      screen.getByText("Could not load today's usage.")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
