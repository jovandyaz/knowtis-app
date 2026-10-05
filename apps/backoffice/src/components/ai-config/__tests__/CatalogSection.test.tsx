import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type {
  CatalogAlert,
  CatalogModel,
  CatalogOverview,
} from '@knowtis/data-access-admin';
import type { CatalogAlertKind } from '@knowtis/shared-types';

import { CANDIDATES_PAGE_SIZE } from '../CandidatesTable';
import { CatalogSection } from '../CatalogSection';

const {
  useAiCatalogMock,
  useAiConfigMock,
  useAiCatalogCandidatesMock,
  mutationStateMock,
  retireMutate,
  updateCopyMutate,
  resolveAlertMutate,
  syncMutate,
  syncStateMock,
} = vi.hoisted(() => ({
  useAiCatalogMock: vi.fn(),
  useAiConfigMock: vi.fn(),
  useAiCatalogCandidatesMock: vi.fn(),
  mutationStateMock: vi.fn(),
  retireMutate: vi.fn(),
  updateCopyMutate: vi.fn(),
  resolveAlertMutate: vi.fn(),
  syncMutate: vi.fn(),
  syncStateMock: vi.fn(),
}));

const IDLE_MUTATION = { isPending: false, isError: false, error: null };
const IDLE_SYNC = { ...IDLE_MUTATION, isSuccess: false, data: undefined };
const PENDING_MUTATION = { ...IDLE_MUTATION, isPending: true };

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAiCatalog: () => useAiCatalogMock(),
    useAiConfig: () => useAiConfigMock(),
    useAiCatalogCandidates: () => useAiCatalogCandidatesMock(),
    usePromoteCatalogModel: () => ({
      mutate: vi.fn(),
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
    useSyncCatalog: () => ({ mutate: syncMutate, ...syncStateMock() }),
  };
});

const EMPTY_CANDIDATE_PAGE = {
  data: { items: [], total: 0, page: 1, limit: CANDIDATES_PAGE_SIZE },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

function model(overrides: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id: 'openrouter:vendor/cheap-one',
    label: 'Cheap One',
    description: '',
    status: 'candidate',
    tier: 'open',
    inputCostPerToken: 0.0000002,
    outputCostPerToken: 0.0000004,
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
    kind: 'retirement_scheduled',
    detail: 'The provider retires this model on 2026-12-31',
    createdAt: new Date('2026-08-09T10:00:00.000Z'),
    resolvedAt: null,
    ...overrides,
  };
}

function renderSection(overview: Partial<CatalogOverview> = {}) {
  useAiCatalogMock.mockReturnValue({
    data: { promoted: [], alerts: [], ...overview },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  return render(<CatalogSection />);
}

describe('CatalogSection', () => {
  beforeEach(() => {
    retireMutate.mockReset();
    updateCopyMutate.mockReset();
    resolveAlertMutate.mockReset();
    useAiCatalogMock.mockReset();
    useAiConfigMock.mockReset();
    useAiConfigMock.mockReturnValue({ data: [] });
    useAiCatalogCandidatesMock.mockReset();
    useAiCatalogCandidatesMock.mockReturnValue(EMPTY_CANDIDATE_PAGE);
    mutationStateMock.mockReset();
    mutationStateMock.mockReturnValue(IDLE_MUTATION);
    syncMutate.mockReset();
    syncStateMock.mockReturnValue(IDLE_SYNC);
  });

  // Roles are derived from the effective config, so the wiring from
  // useAiConfig into the table is what this test guards.
  it('marks the promoted rows the effective config is serving', () => {
    useAiConfigMock.mockReturnValue({
      data: [
        { key: 'ai_default_model', value: 'openrouter:vendor/cheap-one' },
        {
          key: 'ai_fallback_chain',
          value: 'openrouter:vendor/cheap-one,openrouter:vendor/other',
        },
      ],
    });

    renderSection({ promoted: [model({ status: 'promoted' })] });

    const promotedTable = screen.getByRole('table', {
      name: 'Promoted models',
    });
    expect(
      within(promotedTable).getByText('Serves Default · Fallback')
    ).toBeInTheDocument();
  });

  it('lists an open alert with its kind, model and detail', () => {
    renderSection({ alerts: [alert()] });

    expect(screen.getByText('Retirement scheduled')).toBeInTheDocument();
    expect(screen.getByText('openrouter:z-ai/glm-5.2')).toBeInTheDocument();
    expect(screen.getByText(/retires this model/)).toBeInTheDocument();
  });

  it('wraps a long alert detail instead of letting it widen the page', () => {
    renderSection({ alerts: [alert()] });

    expect(screen.getByText(/retires this model/)).toHaveClass(
      'basis-48',
      'wrap-break-word'
    );
  });

  it('keeps the alerts card inside the layout instead of widening the page', () => {
    renderSection({ alerts: [alert()] });

    expect(
      screen.getByRole('heading', { name: 'Open alerts' }).parentElement
    ).toHaveClass('min-w-0');
  });

  it('keeps the promoted card inside the layout instead of widening the page', () => {
    renderSection();

    expect(
      screen.getByRole('heading', { name: /^promoted/i }).parentElement
    ).toHaveClass('min-w-0');
  });

  const EXPECTED_ALERT_LABELS = {
    unavailable: 'Unavailable',
    pin_unavailable: 'Pin unavailable',
    retirement_scheduled: 'Retirement scheduled',
    selector_empty: 'Selector empty',
    resolution_pending: 'Resolution pending',
    gate_failed: 'Gate failed',
    sync_rejected: 'Sync rejected',
    family_drift: 'Family drift',
    sync_stale: 'Sync stale',
  } satisfies Record<CatalogAlertKind, string>;

  it.each(Object.entries(EXPECTED_ALERT_LABELS))(
    'labels a %s alert as %s',
    (kind, label) => {
      renderSection({ alerts: [alert({ kind })] });

      expect(screen.getByText(label)).toBeInTheDocument();
    }
  );

  it('renders an alert kind this bundle does not know as its raw value', () => {
    renderSection({ alerts: [alert({ kind: 'context_shrink' })] });

    expect(screen.getByText('context_shrink')).toBeInTheDocument();
  });

  it('resolves an alert on click', async () => {
    renderSection({ alerts: [alert({ id: 77 })] });

    await userEvent.click(screen.getByRole('button', { name: /resolve/i }));

    expect(resolveAlertMutate).toHaveBeenCalledWith(77);
  });

  it('names each resolve button by kind so two alerts on one model differ', async () => {
    renderSection({
      alerts: [
        alert({ id: 81, kind: 'unavailable' }),
        alert({ id: 82, kind: 'retirement_scheduled' }),
      ],
    });

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Resolve retirement_scheduled alert for openrouter:z-ai/glm-5.2',
      })
    );

    expect(resolveAlertMutate).toHaveBeenCalledWith(82);
  });

  it('locks Retire while a mutation is in flight', () => {
    mutationStateMock.mockReturnValue(PENDING_MUTATION);
    renderSection({
      promoted: [
        model({
          id: 'openrouter:vendor/live-one',
          label: 'Live One',
          status: 'promoted',
        }),
      ],
    });

    expect(
      screen.getByRole('button', { name: 'Retire Live One' })
    ).toBeDisabled();
  });

  it('locks Promote from the section, not only from its own mutation', () => {
    mutationStateMock.mockReturnValue(PENDING_MUTATION);
    useAiCatalogCandidatesMock.mockReturnValue({
      ...EMPTY_CANDIDATE_PAGE,
      data: {
        items: [model({ label: 'Cheap One' })],
        total: 1,
        page: 1,
        limit: CANDIDATES_PAGE_SIZE,
      },
    });
    renderSection();

    expect(
      screen.getByRole('button', { name: 'Promote Cheap One' })
    ).toBeDisabled();
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
      screen.getByRole('button', { name: 'Save Live One!' })
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
      screen.getByRole('button', { name: 'Save Two!' })
    ).toBeInTheDocument();
  });

  it('tells the admin nothing is promoted yet', () => {
    renderSection();

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

  it('keeps a typed candidate search when the overview fails to load', async () => {
    const { rerender } = renderSection();
    await userEvent.type(screen.getByRole('searchbox'), 'kimi');

    useAiCatalogMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    rerender(<CatalogSection />);

    expect(screen.getByRole('searchbox')).toHaveValue('kimi');
  });

  it('runs a sync on demand', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));

    expect(syncMutate).toHaveBeenCalledTimes(1);
  });

  it('reports what the sync wrote', () => {
    syncStateMock.mockReturnValue({
      ...IDLE_SYNC,
      isSuccess: true,
      data: {
        status: 'completed',
        skippedReason: null,
        upstream: 120,
        candidates: 97,
        indexed: 640,
        alerts: 2,
        failures: 0,
      },
    });
    renderSection();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Synced 120 upstream models: 97 candidate(s), 2 alert(s). Indexed 640 model(s).'
    );
  });

  it('reports an index write that stored nothing as zero indexed', () => {
    syncStateMock.mockReturnValue({
      ...IDLE_SYNC,
      isSuccess: true,
      data: {
        status: 'completed',
        skippedReason: null,
        upstream: 120,
        candidates: 97,
        indexed: 0,
        alerts: 2,
        failures: 0,
      },
    });
    renderSection();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Synced 120 upstream models: 97 candidate(s), 2 alert(s). Indexed 0 model(s).'
    );
  });

  it('leaves the index out of the summary when the API did not report it', () => {
    syncStateMock.mockReturnValue({
      ...IDLE_SYNC,
      isSuccess: true,
      data: {
        status: 'completed',
        skippedReason: null,
        upstream: 120,
        candidates: 97,
        alerts: 2,
        failures: 0,
      },
    });
    renderSection();

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(
      'Synced 120 upstream models: 97 candidate(s), 2 alert(s).'
    );
    expect(status).not.toHaveTextContent(/indexed/i);
  });

  it('says another sync holds the lock when that is what stopped it', () => {
    syncStateMock.mockReturnValue({
      ...IDLE_SYNC,
      isSuccess: true,
      data: {
        status: 'skipped',
        skippedReason: 'locked',
        upstream: 0,
        candidates: 0,
        indexed: 0,
        alerts: 0,
        failures: 0,
      },
    });
    renderSection();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Skipped: another sync is already running.'
    );
  });

  it('still reports a sync whose skip reason this bundle predates', () => {
    syncStateMock.mockReturnValue({
      ...IDLE_SYNC,
      isSuccess: true,
      data: {
        status: 'skipped',
        skippedReason: 'some_future_reason',
        upstream: 0,
        candidates: 0,
        indexed: 0,
        alerts: 0,
        failures: 0,
      },
    });
    renderSection();

    expect(screen.getByRole('status')).toHaveTextContent(/skipped/i);
  });

  it('disables the sync button while another catalog mutation is in flight', () => {
    mutationStateMock.mockReturnValue(PENDING_MUTATION);
    renderSection();

    expect(screen.getByRole('button', { name: /sync now/i })).toBeDisabled();
  });
});
