import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { TimeseriesBucket } from '@knowtis/data-access-admin';

import { TimeSeriesChart } from '../TimeSeriesChart';

const BUCKETS: TimeseriesBucket[] = [
  {
    bucketStart: new Date('2026-07-15T10:00:00.000Z'),
    requests: 3,
    inputTokens: 120,
    outputTokens: 60,
    costUsd: 0.0042,
  },
  {
    bucketStart: new Date('2026-07-15T11:00:00.000Z'),
    requests: 5,
    inputTokens: 200,
    outputTokens: 90,
    costUsd: 0.0075,
  },
];

describe('TimeSeriesChart', () => {
  it('exposes bucket values through an off-screen data table', () => {
    render(<TimeSeriesChart buckets={BUCKETS} metric="cost" period="day" />);

    const table = screen.getByRole('table', {
      name: 'cost over time for the selected period',
    });
    expect(
      within(table).getByRole('columnheader', { name: 'Time' })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Cost (USD)' })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('rowheader', { name: '10:00' })
    ).toBeInTheDocument();
    expect(within(table).getByText('$0.0042')).toBeInTheDocument();
    expect(within(table).getByText('$0.0075')).toBeInTheDocument();
  });

  it('splits input and output columns for the tokens metric', () => {
    render(<TimeSeriesChart buckets={BUCKETS} metric="tokens" period="day" />);

    const table = screen.getByRole('table', {
      name: 'tokens over time for the selected period',
    });
    expect(
      within(table).getByRole('columnheader', { name: 'Input tokens' })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Output tokens' })
    ).toBeInTheDocument();
    expect(within(table).getByText('120')).toBeInTheDocument();
    expect(within(table).getByText('90')).toBeInTheDocument();
  });

  it('renders a single requests column for the requests metric', () => {
    render(
      <TimeSeriesChart buckets={BUCKETS} metric="requests" period="day" />
    );

    const table = screen.getByRole('table', {
      name: 'requests over time for the selected period',
    });
    const columnHeaders = within(table).getAllByRole('columnheader');
    expect(columnHeaders.map((header) => header.textContent)).toEqual([
      'Time',
      'Requests',
    ]);
    expect(within(table).getByText('3')).toBeInTheDocument();
    expect(within(table).getByText('5')).toBeInTheDocument();
  });

  it('renders only the header row when there are no buckets', () => {
    render(<TimeSeriesChart buckets={[]} metric="cost" period="day" />);

    const table = screen.getByRole('table', {
      name: 'cost over time for the selected period',
    });
    expect(
      within(table).getByRole('columnheader', { name: 'Time' })
    ).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(1);
    expect(within(table).queryByRole('rowheader')).not.toBeInTheDocument();
  });
});
