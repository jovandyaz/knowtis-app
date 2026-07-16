import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { AiMetricsPage } from '../AiMetricsPage';

const useGlobalAiMetricsMock = vi.fn();
const useGlobalAiTimeseriesMock = vi.fn();
const timeSeriesChartSpy = vi.fn();

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useGlobalAiMetrics: (period: string) => useGlobalAiMetricsMock(period),
    useGlobalAiTimeseries: (period: string) =>
      useGlobalAiTimeseriesMock(period),
  };
});

vi.mock('@/components/charts/TimeSeriesChart', () => ({
  TimeSeriesChart: (props: { metric: string }) => {
    timeSeriesChartSpy(props);
    return <div role="img" aria-label={`${props.metric} chart stub`} />;
  },
}));

const SUMMARY = {
  totalRequests: 40,
  totalInputTokens: 3000,
  totalOutputTokens: 1000,
  totalCostUsd: 0.2,
  byAction: {
    agent: { requests: 30, tokens: 3500, costUsd: 0.18 },
    'ghost-text': { requests: 10, tokens: 500, costUsd: 0.02 },
  },
  byModel: {
    'claude-haiku-4-5': { requests: 10, tokens: 500, costUsd: 0.05 },
    'claude-sonnet-5': { requests: 30, tokens: 3500, costUsd: 0.15 },
  },
};

const TIMESERIES = {
  buckets: [
    {
      bucketStart: new Date('2026-07-15T10:00:00.000Z'),
      requests: 40,
      inputTokens: 3000,
      outputTokens: 1000,
      costUsd: 0.2,
    },
  ],
};

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AiMetricsPage />
    </QueryClientProvider>
  );
}

function mockSuccess() {
  useGlobalAiMetricsMock.mockReturnValue({
    data: SUMMARY,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  useGlobalAiTimeseriesMock.mockReturnValue({
    data: TIMESERIES,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

describe('AiMetricsPage', () => {
  beforeEach(() => {
    useGlobalAiMetricsMock.mockReset();
    useGlobalAiTimeseriesMock.mockReset();
    timeSeriesChartSpy.mockClear();
  });

  it('renders stat cards including average cost per request', () => {
    mockSuccess();
    renderPage();

    const [requestsLabel] = screen.getAllByText('Requests');
    expect(requestsLabel).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('4,000')).toBeInTheDocument();
    expect(screen.getByText('3,000 in · 1,000 out')).toBeInTheDocument();
    expect(screen.getByText('$0.2000')).toBeInTheDocument();
    expect(screen.getByText('$0.0050')).toBeInTheDocument();
  });

  it('renders spend by model sorted by cost with share percentages', () => {
    mockSuccess();
    renderPage();

    const list = screen.getByRole('list', { name: 'Spend by model' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('claude-sonnet-5');
    expect(items[1]).toHaveTextContent('claude-haiku-4-5');
    expect(screen.getByText('$0.1500 · 75%')).toBeInTheDocument();
    expect(screen.getByText('$0.0500 · 25%')).toBeInTheDocument();
  });

  it('switches the time series metric through the tabs', async () => {
    mockSuccess();
    renderPage();

    expect(timeSeriesChartSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ metric: 'cost' })
    );

    await userEvent.click(screen.getByRole('tab', { name: 'tokens' }));
    expect(timeSeriesChartSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ metric: 'tokens' })
    );
  });

  it('shows an independent error state for the time series without blanking stats', () => {
    useGlobalAiMetricsMock.mockReturnValue({
      data: SUMMARY,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useGlobalAiTimeseriesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText('$0.2000')).toBeInTheDocument();
    expect(
      screen.getByText('Could not load the time series.')
    ).toBeInTheDocument();
  });

  it('shows a retryable error state when metrics fail', async () => {
    const refetch = vi.fn();
    useGlobalAiMetricsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    useGlobalAiTimeseriesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText('Could not load metrics.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the time series when metrics fail but the series succeeds', () => {
    useGlobalAiMetricsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    useGlobalAiTimeseriesMock.mockReturnValue({
      data: TIMESERIES,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText('Could not load metrics.')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'cost chart stub' })
    ).toBeInTheDocument();
    expect(timeSeriesChartSpy).toHaveBeenCalled();
  });

  it('shows a dash average cost and empty states when there is no usage', () => {
    useGlobalAiMetricsMock.mockReturnValue({
      data: {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        byAction: {},
        byModel: {},
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useGlobalAiTimeseriesMock.mockReturnValue({
      data: { buckets: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
    expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();

    expect(screen.getAllByText('No activity')).toHaveLength(2);
    expect(
      screen.getByText('No AI usage recorded for this period.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('No AI actions recorded for this period.')
    ).toBeInTheDocument();
  });
});
