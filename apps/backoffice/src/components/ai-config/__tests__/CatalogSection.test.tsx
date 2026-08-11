import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type {
  CatalogAlert,
  CatalogModel,
  CatalogOverview,
} from '@knowtis/data-access-admin';
import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from '@knowtis/shared-types';

import { CatalogSection } from '../CatalogSection';

const {
  useAiCatalogMock,
  mutationStateMock,
  promoteMutate,
  retireMutate,
  updateCopyMutate,
  resolveAlertMutate,
} = vi.hoisted(() => ({
  useAiCatalogMock: vi.fn(),
  mutationStateMock: vi.fn(),
  promoteMutate: vi.fn(),
  retireMutate: vi.fn(),
  updateCopyMutate: vi.fn(),
  resolveAlertMutate: vi.fn(),
}));

const IDLE_MUTATION = { isPending: false, isError: false, error: null };
const PENDING_MUTATION = { ...IDLE_MUTATION, isPending: true };

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAiCatalog: () => useAiCatalogMock(),
    usePromoteCatalogModel: () => ({
      mutate: promoteMutate,
      ...mutationStateMock(),
    }),
    useRetireCatalogModel: () => ({
      mutate: retireMutate,
      ...mutationStateMock(),
    }),
    useUpdateCatalogCopy: () => ({
      mutate: updateCopyMutate,
      ...mutationStateMock(),
    }),
    useResolveCatalogAlert: () => ({
      mutate: resolveAlertMutate,
      ...mutationStateMock(),
    }),
  };
});

const CHEAP_OUTPUT_COST = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN / 2;
const EXPENSIVE_OUTPUT_COST = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN * 4;
const BYOK_ONLY_BADGE = /byok only/i;

function model(overrides: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id: 'openrouter:vendor/cheap-one',
    label: 'Cheap One',
    description: '',
    status: 'candidate',
    tier: 'open',
    inputCostPerToken: 0.0000002,
    outputCostPerToken: CHEAP_OUTPUT_COST,
    maxInputTokens: 131_072,
    maxOutputTokens: null,
    intelligenceIndex: 40,
    upstreamCreatedAt: null,
    upstreamExpirationDate: null,
    lastSeenAt: new Date('2026-08-09T10:00:00.000Z'),
    promotedAt: null,
    ...overrides,
  };
}

function alert(overrides: Partial<CatalogAlert> = {}): CatalogAlert {
  return {
    id: 58,
    modelId: 'openrouter:z-ai/glm-5.2',
    kind: 'price_drift',
    detail: 'OpenRouter output cost $1.62/M vs vendored $4.40/M',
    createdAt: new Date('2026-08-09T10:00:00.000Z'),
    resolvedAt: null,
    ...overrides,
  };
}

function renderSection(overview: Partial<CatalogOverview> = {}) {
  useAiCatalogMock.mockReturnValue({
    data: { candidates: [], promoted: [], alerts: [], ...overview },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  return render(<CatalogSection />);
}

function candidatesTable() {
  return within(screen.getByRole('table', { name: /candidates/i }));
}

function rowFor(label: string): HTMLElement {
  const row = screen.getByText(label).closest('tr');
  if (!row) {
    throw new Error(`No candidate row for ${label}`);
  }
  return row;
}

describe('CatalogSection', () => {
  beforeEach(() => {
    promoteMutate.mockReset();
    retireMutate.mockReset();
    updateCopyMutate.mockReset();
    resolveAlertMutate.mockReset();
    useAiCatalogMock.mockReset();
    mutationStateMock.mockReset();
    mutationStateMock.mockReturnValue(IDLE_MUTATION);
  });

  it('lists an open alert with its kind, model and detail', () => {
    renderSection({ alerts: [alert()] });

    expect(screen.getByText('Price drift')).toBeInTheDocument();
    expect(screen.getByText('openrouter:z-ai/glm-5.2')).toBeInTheDocument();
    expect(screen.getByText(/vs vendored/)).toBeInTheDocument();
  });

  it('renders an alert kind this bundle does not know as its raw value', () => {
    renderSection({ alerts: [alert({ kind: 'context_shrink' })] });

    expect(screen.getByText('context_shrink')).toBeInTheDocument();
  });

  it('resolves an alert on click', async () => {
    renderSection({ alerts: [alert({ id: 77 })] });

    await userEvent.click(screen.getByRole('button', { name: /resolve/i }));

    expect(resolveAlertMutate).toHaveBeenCalledWith(77);
  });

  it('orders candidates by intelligence, unscored ones last', () => {
    renderSection({
      candidates: [
        model({
          id: 'openrouter:vendor/unscored',
          label: 'Unscored',
          intelligenceIndex: null,
        }),
        model({
          id: 'openrouter:vendor/mid',
          label: 'Mid',
          intelligenceIndex: 30,
        }),
        model({
          id: 'openrouter:vendor/top',
          label: 'Top',
          intelligenceIndex: 55,
        }),
      ],
    });

    const labels = candidatesTable()
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getByRole('button').getAttribute('aria-label'));

    expect(labels).toEqual(['Promote Top', 'Promote Mid', 'Promote Unscored']);
  });

  it('marks a candidate the free tier cannot absorb as BYOK only', () => {
    renderSection({
      candidates: [
        model({ label: 'Pricey', outputCostPerToken: EXPENSIVE_OUTPUT_COST }),
      ],
    });

    expect(
      within(rowFor('Pricey')).getByText(BYOK_ONLY_BADGE)
    ).toBeInTheDocument();
  });

  it('marks a candidate stored with a negative price as BYOK only, as the server reads it', () => {
    renderSection({
      candidates: [
        model({ label: 'Broken row', outputCostPerToken: -CHEAP_OUTPUT_COST }),
      ],
    });

    expect(
      within(rowFor('Broken row')).getByText(BYOK_ONLY_BADGE)
    ).toBeInTheDocument();
  });

  it('leaves a candidate under the free ceiling unmarked', () => {
    renderSection({
      candidates: [
        model({
          label: 'At the ceiling',
          outputCostPerToken: FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
        }),
      ],
    });

    expect(
      within(rowFor('At the ceiling')).queryByText(BYOK_ONLY_BADGE)
    ).not.toBeInTheDocument();
  });

  it('shows what a candidate costs per million tokens', () => {
    renderSection({
      candidates: [
        model({
          label: 'Priced',
          inputCostPerToken: 0.0000002,
          outputCostPerToken: 0.0000008,
        }),
      ],
    });

    const row = within(rowFor('Priced'));
    expect(row.getByText('$0.20')).toBeInTheDocument();
    expect(row.getByText('$0.80')).toBeInTheDocument();
  });

  it('promotes a candidate into the open tier', async () => {
    renderSection({ candidates: [model({ id: 'openrouter:vendor/pick-me' })] });

    await userEvent.click(screen.getByRole('button', { name: /promote/i }));

    expect(promoteMutate).toHaveBeenCalledWith({
      id: 'openrouter:vendor/pick-me',
      tier: 'open',
    });
  });

  it('locks Promote and Retire while a mutation is in flight', () => {
    mutationStateMock.mockReturnValue(PENDING_MUTATION);
    renderSection({
      candidates: [model({ label: 'Cheap One' })],
      promoted: [
        model({
          id: 'openrouter:vendor/live-one',
          label: 'Live One',
          status: 'promoted',
        }),
      ],
    });

    expect(
      screen.getByRole('button', { name: 'Promote Cheap One' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Retire Live One' })
    ).toBeDisabled();
  });

  it('ignores a second Promote while the first one is still in flight', async () => {
    mutationStateMock.mockReturnValue(PENDING_MUTATION);
    renderSection({ candidates: [model({ id: 'openrouter:vendor/pick-me' })] });

    await userEvent.click(screen.getByRole('button', { name: /promote/i }));

    expect(promoteMutate).not.toHaveBeenCalled();
  });

  it('retires a promoted model', async () => {
    renderSection({
      promoted: [
        model({
          id: 'openrouter:vendor/live-one',
          label: 'Live One',
          status: 'promoted',
        }),
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: /retire/i }));

    expect(retireMutate).toHaveBeenCalledWith('openrouter:vendor/live-one');
  });

  it('saves an edited label for a promoted model', async () => {
    renderSection({
      promoted: [
        model({
          id: 'openrouter:vendor/live-one',
          label: 'Live One',
          description: 'Fast open model',
          status: 'promoted',
        }),
      ],
    });

    await userEvent.type(
      screen.getByLabelText(/label for openrouter:vendor\/live-one/i),
      '!'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save Live One' })
    );

    expect(updateCopyMutate).toHaveBeenCalledWith({
      id: 'openrouter:vendor/live-one',
      patch: { label: 'Live One!', description: 'Fast open model' },
    });
  });

  it('offers no Save until the copy actually changes', () => {
    renderSection({
      promoted: [model({ label: 'Live One', status: 'promoted' })],
    });

    expect(
      screen.queryByRole('button', { name: /^save/i })
    ).not.toBeInTheDocument();
  });

  it('names each Save after the model it saves', async () => {
    renderSection({
      promoted: [
        model({
          id: 'openrouter:vendor/one',
          label: 'One',
          status: 'promoted',
        }),
        model({
          id: 'openrouter:vendor/two',
          label: 'Two',
          status: 'promoted',
        }),
      ],
    });

    await userEvent.type(
      screen.getByLabelText(/label for openrouter:vendor\/two/i),
      '!'
    );

    expect(
      screen.getByRole('button', { name: 'Save Two' })
    ).toBeInTheDocument();
  });

  it('tells the admin nothing is promoted yet', () => {
    renderSection({ candidates: [model()] });

    expect(screen.getByText(/no promoted model/i)).toBeInTheDocument();
  });

  it('offers a retry when the catalog cannot load', async () => {
    const refetch = vi.fn();
    useAiCatalogMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<CatalogSection />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(refetch).toHaveBeenCalled();
  });
});
