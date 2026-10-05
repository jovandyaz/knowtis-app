import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { PlatformResolution } from '@knowtis/data-access-admin';

import { PlatformResolutionsSection } from '../PlatformResolutionsSection';

const {
  usePlatformResolutionsMock,
  rollbackMutate,
  rollbackReset,
  rollbackState,
  resetMutate,
  resetReset,
  resetState,
} = vi.hoisted(() => ({
  usePlatformResolutionsMock: vi.fn(),
  rollbackMutate: vi.fn(),
  rollbackReset: vi.fn(),
  rollbackState: {
    isPending: false,
    isError: false,
    error: null as Error | null,
  },
  resetMutate: vi.fn(),
  resetReset: vi.fn(),
  resetState: {
    isPending: false,
    isError: false,
    error: null as Error | null,
  },
}));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    usePlatformResolutions: () => usePlatformResolutionsMock(),
    useRollbackResolution: () => ({
      mutate: rollbackMutate,
      reset: rollbackReset,
      ...rollbackState,
    }),
    useResetAiConfig: () => ({
      mutate: resetMutate,
      reset: resetReset,
      ...resetState,
    }),
  };
});

const ACTIVE = 'openrouter:z-ai/glm-5.2';
const PREVIOUS = 'openrouter:z-ai/glm-5.1';
const PENDING = 'openrouter:z-ai/glm-5.3';
const PIN = 'anthropic:claude-sonnet-5';
const CHANGED_AT = new Date('2026-10-01T00:00:00.000Z');
const RUN_URL = 'https://github.com/jovandyaz/knowtis-app/actions/runs/123';

function resolution(
  overrides: Partial<PlatformResolution> = {}
): PlatformResolution {
  return {
    intent: 'balanced',
    selectorKey: 'platform.balanced',
    configKey: 'ai_default_model',
    pin: null,
    served: ACTIVE,
    activeModelId: ACTIVE,
    changedAt: CHANGED_AT,
    previousModelId: null,
    releasedModelId: null,
    releasedAt: null,
    pendingModelId: null,
    gateStatus: null,
    gateDetail: null,
    gateRunUrl: null,
    candidateModelId: ACTIVE,
    ...overrides,
  };
}

function renderSection(intents: PlatformResolution[]) {
  usePlatformResolutionsMock.mockReturnValue({
    data: { intents, lastSyncAt: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  return render(<PlatformResolutionsSection />);
}

function rowOf(intentLabel: string) {
  return screen.getByRole('row', { name: new RegExp(`^${intentLabel}\\b`) });
}

describe('PlatformResolutionsSection', () => {
  beforeEach(() => {
    usePlatformResolutionsMock.mockReset();
    rollbackMutate.mockReset();
    rollbackReset.mockReset();
    resetMutate.mockReset();
    resetReset.mockReset();
    for (const state of [rollbackState, resetState]) {
      state.isPending = false;
      state.isError = false;
      state.error = null;
    }
  });

  it('shows auto and pinned intents', () => {
    renderSection([
      resolution({
        intent: 'fast',
        selectorKey: 'platform.fast',
        configKey: 'ai_fast_model',
        served: 'openrouter:minimax/minimax-m2.5',
        activeModelId: 'openrouter:minimax/minimax-m2.5',
        candidateModelId: 'openrouter:minimax/minimax-m2.7',
      }),
      resolution({ pin: PIN, served: PIN }),
    ]);

    const fast = within(rowOf('Fast'));
    expect(fast.getByText('auto')).toBeInTheDocument();
    expect(
      fast.getAllByText('openrouter:minimax/minimax-m2.5')
    ).not.toHaveLength(0);
    expect(
      fast.getByText('openrouter:minimax/minimax-m2.7')
    ).toBeInTheDocument();
    expect(
      fast.queryByRole('button', { name: /release pin/i })
    ).not.toBeInTheDocument();

    const balanced = within(rowOf('Balanced'));
    expect(balanced.getByText('pinned')).toBeInTheDocument();
    expect(balanced.getByText(PIN)).toBeInTheDocument();
    expect(balanced.getAllByText(ACTIVE)).not.toHaveLength(0);
    expect(
      balanced.getByText(`since ${CHANGED_AT.toLocaleDateString()}`)
    ).toBeInTheDocument();
    expect(
      balanced.getByRole('button', { name: 'Release pin: Balanced' })
    ).toHaveTextContent('Release pin');
  });

  it('releases a pin from its row', async () => {
    renderSection([resolution({ pin: PIN, served: PIN })]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Release pin: Balanced' })
    );

    expect(resetMutate).toHaveBeenCalledWith({ key: 'ai_default_model' });
  });

  it('marks a pin the runtime cannot serve as stale and still releases it', () => {
    renderSection([resolution({ pin: 'openrouter:vendor/gone' })]);

    const balanced = within(rowOf('Balanced'));
    expect(balanced.getByText('stale')).toBeInTheDocument();
    expect(rowOf('Balanced')).toHaveTextContent(
      'stored openrouter:vendor/gone is no longer served'
    );
    expect(
      balanced.getByRole('button', { name: 'Release pin: Balanced' })
    ).toBeInTheDocument();
  });

  it('shows the pin an admin last released', () => {
    const releasedAt = new Date('2026-10-03T00:00:00.000Z');
    renderSection([
      resolution({ releasedModelId: 'openrouter:vendor/old-pin', releasedAt }),
    ]);

    expect(rowOf('Balanced')).toHaveTextContent(
      `released openrouter:vendor/old-pin on ${releasedAt.toLocaleDateString()}`
    );
  });

  it('shows the pending model, its failed gate detail and run link', () => {
    renderSection([
      resolution({
        pendingModelId: PENDING,
        gateStatus: 'failed',
        gateDetail: 'tool-calls leg failed: 3 of 20 cases',
        gateRunUrl: RUN_URL,
      }),
    ]);

    const balanced = within(rowOf('Balanced'));
    expect(balanced.getByText(PENDING)).toBeInTheDocument();
    expect(balanced.getByText('gate failed')).toBeInTheDocument();
    expect(
      balanced.getByText('tool-calls leg failed: 3 of 20 cases')
    ).toBeInTheDocument();
    const run = balanced.getByRole('link', { name: 'Gate run: Balanced' });
    expect(run).toHaveAttribute('href', RUN_URL);
    expect(run).toHaveAttribute('target', '_blank');
    expect(run).toHaveAttribute('rel', 'noreferrer');
  });

  it('shows a pending model still waiting for its gate', () => {
    renderSection([
      resolution({ pendingModelId: PENDING, gateStatus: 'pending' }),
    ]);

    expect(
      within(rowOf('Balanced')).getByText('gate pending')
    ).toBeInTheDocument();
  });

  it('hides the run link for a non-https url', () => {
    for (const gateRunUrl of [
      'http://github.com/jovandyaz/knowtis-app/actions/runs/123',
      'javascript:alert(1)',
    ]) {
      const { unmount } = renderSection([
        resolution({
          pendingModelId: PENDING,
          gateStatus: 'failed',
          gateDetail: 'eval failed',
          gateRunUrl,
        }),
      ]);

      expect(within(rowOf('Balanced')).getByText(PENDING)).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('links the last gate run once nothing is pending', () => {
    renderSection([resolution({ gateRunUrl: RUN_URL })]);

    const run = within(rowOf('Balanced')).getByRole('link', {
      name: 'Last gate run: Balanced',
    });
    expect(run).toHaveTextContent('Last gate run');
    expect(run).toHaveAttribute('href', RUN_URL);
    expect(run).toHaveAttribute('target', '_blank');
    expect(run).toHaveAttribute('rel', 'noreferrer');
  });

  it('hides the last gate run link for a non-https url', () => {
    renderSection([
      resolution({
        gateRunUrl: 'http://github.com/jovandyaz/knowtis-app/actions/runs/123',
      }),
    ]);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says in the roll back dialog that a served pin keeps serving', async () => {
    renderSection([
      resolution({ pin: PIN, served: PIN, previousModelId: PREVIOUS }),
    ]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Roll back: Balanced' })
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `The pin keeps serving ${PIN} until it is released.`
    );
  });

  it('says nothing about a pin the runtime cannot serve', async () => {
    renderSection([
      resolution({ pin: 'openrouter:vendor/gone', previousModelId: PREVIOUS }),
    ]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Roll back: Balanced' })
    );

    expect(screen.getByRole('dialog')).not.toHaveTextContent('keeps serving');
  });

  it('shows why a roll back failed', () => {
    rollbackState.isError = true;
    rollbackState.error = new Error(
      "'platform.balanced' changed since it was loaded; reload and try again"
    );
    renderSection([resolution({ previousModelId: PREVIOUS })]);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'changed since it was loaded; reload and try again'
    );
  });

  it('shows why a release was refused', () => {
    resetState.isError = true;
    resetState.error = new Error('each tier needs its own model');
    renderSection([resolution({ pin: PIN, served: PIN })]);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'each tier needs its own model'
    );
  });

  it("clears the other action's error before acting", async () => {
    renderSection([
      resolution({ pin: PIN, served: PIN, previousModelId: PREVIOUS }),
    ]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Release pin: Balanced' })
    );
    expect(rollbackReset).toHaveBeenCalled();
    expect(resetReset).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Roll back: Balanced' })
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Roll back',
      })
    );
    expect(resetReset).toHaveBeenCalled();
  });

  it('rolls back the pair its confirmation names', async () => {
    renderSection([resolution({ previousModelId: PREVIOUS })]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Roll back: Balanced' })
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(
      `The active model goes back from ${ACTIVE} to ${PREVIOUS}.`
    );
    expect(dialog).toHaveTextContent(
      `Auto mode can bring ${ACTIVE} back after the next sync and gate run. To keep ${PREVIOUS}, pin it.`
    );
    expect(dialog).not.toHaveTextContent('keeps serving');
    expect(rollbackMutate).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Roll back' })
    );

    expect(rollbackMutate).toHaveBeenCalledWith({
      selectorKey: 'platform.balanced',
      activeModelId: ACTIVE,
      previousModelId: PREVIOUS,
    });
  });

  it('hides Roll back without a previous model', () => {
    renderSection([resolution({ previousModelId: null })]);

    expect(
      within(rowOf('Balanced')).queryByRole('button', { name: /roll back/i })
    ).not.toBeInTheDocument();
  });

  it('renders an active model missing from the index', () => {
    renderSection([
      resolution({
        served: 'openrouter:vendor/delisted-one',
        activeModelId: 'openrouter:vendor/delisted-one',
        previousModelId: ACTIVE,
        candidateModelId: ACTIVE,
      }),
    ]);

    const balanced = within(rowOf('Balanced'));
    expect(
      balanced.getAllByText('openrouter:vendor/delisted-one')
    ).not.toHaveLength(0);
    expect(balanced.getByText(ACTIVE)).toBeInTheDocument();
    expect(
      balanced.getByRole('button', { name: 'Roll back: Balanced' })
    ).toBeInTheDocument();
  });

  it('locks the actions while a change is in flight', () => {
    rollbackState.isPending = true;
    renderSection([
      resolution({ pin: PIN, served: PIN, previousModelId: PREVIOUS }),
    ]);

    expect(
      screen.getByRole('button', { name: 'Release pin: Balanced' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Roll back: Balanced' })
    ).toBeDisabled();
  });

  it('offers a retry when the resolutions cannot load', async () => {
    const refetch = vi.fn();
    usePlatformResolutionsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<PlatformResolutionsSection />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(refetch).toHaveBeenCalled();
  });
});
