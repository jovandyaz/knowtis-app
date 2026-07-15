import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { AiMetricsPage } from '../AiMetricsPage';

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useGlobalAiUsage: vi.fn().mockReturnValue({
      data: {
        totalInputTokens: 1000,
        totalOutputTokens: 2000,
        totalCostUsd: 0.42,
        requestCount: 12,
      },
      isLoading: false,
    }),
    useGlobalAiMetrics: vi.fn().mockReturnValue({
      data: {
        totalRequests: 12,
        totalInputTokens: 1000,
        totalOutputTokens: 2000,
        totalCostUsd: 0.42,
        byAction: { summarize: { requests: 5, tokens: 800, costUsd: 0.2 } },
      },
      isLoading: false,
    }),
  };
});

describe('AiMetricsPage', () => {
  it('renders usage cards and the per-action breakdown', () => {
    render(<AiMetricsPage />);
    expect(
      screen.getByRole('heading', { name: /ai metrics/i })
    ).toBeInTheDocument();
    expect(screen.getByText('$0.4200')).toBeInTheDocument();
    expect(screen.getByText('summarize')).toBeInTheDocument();
  });
});
