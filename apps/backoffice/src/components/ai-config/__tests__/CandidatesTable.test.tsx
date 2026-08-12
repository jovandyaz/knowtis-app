import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type {
  AiCatalogCandidatesParams,
  CatalogModel,
  PaginatedCandidates,
} from '@knowtis/data-access-admin';
import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from '@knowtis/shared-types';

import { CandidatesTable } from '../CandidatesTable';

const { useAiCatalogCandidatesMock, promoteMutate, promoteStateMock } =
  vi.hoisted(() => ({
    useAiCatalogCandidatesMock: vi.fn(),
    promoteMutate: vi.fn(),
    promoteStateMock: vi.fn(),
  }));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAiCatalogCandidates: (params: AiCatalogCandidatesParams) =>
      useAiCatalogCandidatesMock(params),
    usePromoteCatalogModel: () => ({
      mutate: promoteMutate,
      ...promoteStateMock(),
    }),
  };
});

const IDLE_PROMOTE = { isPending: false, isError: false, error: null };
const CHEAP_OUTPUT_COST = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN / 2;
const EXPENSIVE_OUTPUT_COST = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN * 4;
const BYOK_ONLY_BADGE = /byok only/i;
const TOTAL_CANDIDATES = 97;

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function model(overrides: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id: 'openrouter:vendor/one',
    label: 'One',
    description: '',
    status: 'candidate',
    tier: 'open',
    inputCostPerToken: 0.0000002,
    outputCostPerToken: CHEAP_OUTPUT_COST,
    maxInputTokens: 131_072,
    maxOutputTokens: null,
    intelligenceIndex: 42,
    upstreamCreatedAt: null,
    upstreamExpirationDate: null,
    lastSeenAt: new Date('2026-08-11T00:00:00.000Z'),
    promotedAt: null,
    ...overrides,
  };
}

function page(items: CatalogModel[]): PaginatedCandidates {
  return { items, total: TOTAL_CANDIDATES, page: 1, limit: 25 };
}

function renderTable(
  items: CatalogModel[] = [model()],
  query: Record<string, unknown> = {}
) {
  useAiCatalogCandidatesMock.mockReturnValue({
    data: page(items),
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    ...query,
  });
  return render(<CandidatesTable />, { wrapper: Wrapper });
}

function lastParams(): AiCatalogCandidatesParams {
  const call = useAiCatalogCandidatesMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('useAiCatalogCandidates was never called');
  }
  return call[0];
}

function rowFor(label: string): HTMLElement {
  const row = screen.getByText(label).closest('tr');
  if (!row) {
    throw new Error(`No candidate row for ${label}`);
  }
  return row;
}

describe('CandidatesTable', () => {
  beforeEach(() => {
    useAiCatalogCandidatesMock.mockReset();
    promoteMutate.mockReset();
    promoteStateMock.mockReset();
    promoteStateMock.mockReturnValue(IDLE_PROMOTE);
  });

  it('should ask for page 1 again when the search term changes', async () => {
    renderTable();

    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(lastParams()).toMatchObject({ page: 2 });

    await userEvent.type(screen.getByRole('searchbox'), 'kimi');

    await waitFor(() => {
      expect(lastParams()).toMatchObject({ page: 1, search: 'kimi' });
    });
  });

  it('should hold the search term back until the typing settles', async () => {
    renderTable();

    await userEvent.type(screen.getByRole('searchbox'), 'kimi');

    expect(lastParams().search).toBeUndefined();
    await waitFor(() => expect(lastParams().search).toBe('kimi'));
  });

  it('should report the server total, not the length of the page', () => {
    renderTable();

    expect(
      screen.getByRole('heading', { name: /candidates \(97\)/i })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('table', { name: /candidates/i })).getAllByRole(
        'row'
      )
    ).toHaveLength(2);
  });

  it('should page over the server total rather than the rows in hand', () => {
    renderTable();

    expect(screen.getByText('Page 1 of 4')).toBeInTheDocument();
  });

  it('should ask for one page worth of rows, within the API limit cap', () => {
    renderTable();

    expect(lastParams().limit).toBe(25);
  });

  it('should keep the rows on screen while the next page is fetched', () => {
    renderTable([model({ label: 'Still here' })], { isFetching: true });

    expect(screen.getByText('Still here')).toBeInTheDocument();
  });

  it('should mark a candidate the free tier cannot absorb as BYOK only', () => {
    renderTable([
      model({ label: 'Pricey', outputCostPerToken: EXPENSIVE_OUTPUT_COST }),
    ]);

    expect(
      within(rowFor('Pricey')).getByText(BYOK_ONLY_BADGE)
    ).toBeInTheDocument();
  });

  it('should mark a candidate stored with a negative price as BYOK only, as the server reads it', () => {
    renderTable([
      model({ label: 'Broken row', outputCostPerToken: -CHEAP_OUTPUT_COST }),
    ]);

    expect(
      within(rowFor('Broken row')).getByText(BYOK_ONLY_BADGE)
    ).toBeInTheDocument();
  });

  it('should leave a candidate under the free ceiling unmarked', () => {
    renderTable([
      model({
        label: 'At the ceiling',
        outputCostPerToken: FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
      }),
    ]);

    expect(
      within(rowFor('At the ceiling')).queryByText(BYOK_ONLY_BADGE)
    ).not.toBeInTheDocument();
  });

  it('should show what a candidate costs per million tokens', () => {
    renderTable([
      model({
        label: 'Priced',
        inputCostPerToken: 0.0000002,
        outputCostPerToken: 0.0000008,
      }),
    ]);

    const row = within(rowFor('Priced'));
    expect(row.getByText('$0.20')).toBeInTheDocument();
    expect(row.getByText('$0.80')).toBeInTheDocument();
  });

  it('should show an unscored candidate as a dash rather than a zero', () => {
    renderTable([model({ label: 'Unscored', intelligenceIndex: null })]);

    expect(within(rowFor('Unscored')).getByText('—')).toBeInTheDocument();
  });

  it('should promote a candidate into the open tier', async () => {
    renderTable([model({ id: 'openrouter:vendor/pick-me', label: 'Pick Me' })]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Promote Pick Me' })
    );

    expect(promoteMutate).toHaveBeenCalledWith({
      id: 'openrouter:vendor/pick-me',
      tier: 'open',
    });
  });

  it('should ignore a second Promote while the first one is still in flight', async () => {
    promoteStateMock.mockReturnValue({ ...IDLE_PROMOTE, isPending: true });
    renderTable();

    await userEvent.click(screen.getByRole('button', { name: /promote/i }));

    expect(promoteMutate).not.toHaveBeenCalled();
  });

  it('should lock Promote while another catalog mutation is in flight', () => {
    useAiCatalogCandidatesMock.mockReturnValue({
      data: page([model({ label: 'One' })]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<CandidatesTable disabled />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Promote One' })).toBeDisabled();
  });

  it('should report a promotion that failed', () => {
    promoteStateMock.mockReturnValue({ ...IDLE_PROMOTE, isError: true });
    renderTable();

    expect(screen.getByRole('alert')).toHaveTextContent(/could not promote/i);
  });

  it('should show skeleton rows while the first page loads', () => {
    useAiCatalogCandidatesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<CandidatesTable />, { wrapper: Wrapper });

    expect(
      screen.getByRole('table', { name: /candidates/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /promote/i })).toBeNull();
  });

  it('should tell the admin when a search matches nothing', () => {
    useAiCatalogCandidatesMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 25 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<CandidatesTable />, { wrapper: Wrapper });

    expect(screen.getByText(/no candidates found/i)).toBeInTheDocument();
  });

  it('should offer a retry when the candidate page cannot load', async () => {
    const refetch = vi.fn();
    useAiCatalogCandidatesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<CandidatesTable />, { wrapper: Wrapper });

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(refetch).toHaveBeenCalled();
  });

  // jsdom does not lay out, so the card's own min-width is the only
  // observable part of "the table scrolls instead of widening the page".
  it('should keep the table inside its card instead of widening the page', () => {
    const { container } = renderTable();

    expect(container.firstElementChild).toHaveClass('min-w-0');
  });
});
