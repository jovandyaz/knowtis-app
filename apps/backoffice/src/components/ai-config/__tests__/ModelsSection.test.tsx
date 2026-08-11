import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { ModelsSection } from '../ModelsSection';

const {
  useSelectableModelsMock,
  setConfigMutate,
  setConfigState,
  resetConfigMutate,
  resetConfigState,
} = vi.hoisted(() => ({
  useSelectableModelsMock: vi.fn(),
  setConfigMutate: vi.fn(),
  setConfigState: { isPending: false },
  resetConfigMutate: vi.fn(),
  resetConfigState: { isPending: false },
}));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useSelectableModels: () => useSelectableModelsMock(),
    useSetAiConfig: () => ({
      mutate: setConfigMutate,
      isPending: setConfigState.isPending,
      isError: false,
      error: null,
    }),
    useResetAiConfig: () => ({
      mutate: resetConfigMutate,
      isPending: resetConfigState.isPending,
      isError: false,
      error: null,
    }),
  };
});

const MODELS = [
  {
    id: 'anthropic:sonnet',
    label: 'Sonnet',
    tier: 'balanced',
    routableByServer: true,
  },
  {
    id: 'anthropic:haiku',
    label: 'Haiku',
    tier: 'fast',
    routableByServer: true,
  },
];

const RETIRED_MODEL_ID = 'openrouter:vendor/retired-one';

function entryWith(
  source: AiConfigEntry['source'],
  key = 'ai_default_model'
): AiConfigEntry {
  return {
    key,
    value: 'anthropic:sonnet',
    kind: 'model',
    source,
    storedValue: source === 'stale' ? RETIRED_MODEL_ID : null,
    description: null,
    updatedAt: null,
  };
}

function renderSection(source: AiConfigEntry['source'] = 'custom') {
  return render(<ModelsSection entries={[entryWith(source)]} />);
}

describe('ModelsSection', () => {
  beforeEach(() => {
    setConfigMutate.mockReset();
    setConfigState.isPending = false;
    resetConfigMutate.mockReset();
    resetConfigState.isPending = false;
    useSelectableModelsMock.mockReturnValue({
      data: MODELS,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('tells the admin the default model is what free-tier clients get', () => {
    renderSection();

    expect(
      screen.getByText(/every free-tier client gets/i)
    ).toBeInTheDocument();
  });

  it('marks a stored override with a filled custom badge', () => {
    renderSection('custom');

    expect(screen.getByText('custom')).toHaveClass('bg-(--foreground)');
  });

  it('marks the code default with an outline badge', () => {
    renderSection('default');

    expect(screen.getByText('default')).not.toHaveClass('bg-(--foreground)');
  });

  it('offers Reset to default only when the model is a stored override', () => {
    renderSection('custom');

    expect(
      screen.getByRole('button', { name: /^reset .+ to default$/i })
    ).toBeInTheDocument();
  });

  it('hides Reset when the model already runs the code default', () => {
    renderSection('default');

    expect(
      screen.queryByRole('button', { name: /^reset .+ to default$/i })
    ).not.toBeInTheDocument();
  });

  it('resets the model key to its code default on click', async () => {
    renderSection('custom');

    await userEvent.click(
      screen.getByRole('button', { name: /^reset .+ to default$/i })
    );

    expect(resetConfigMutate).toHaveBeenCalledWith({ key: 'ai_default_model' });
  });

  it('disables Reset while the reset is in flight', () => {
    resetConfigState.isPending = true;

    renderSection('custom');

    expect(
      screen.getByRole('button', { name: /^reset .+ to default$/i })
    ).toBeDisabled();
  });
  it('marks a stored value the runtime no longer serves as stale', () => {
    renderSection('stale');

    expect(screen.getByText('stale')).toHaveClass('bg-(--destructive)');
    expect(screen.getByText(/no longer served/i)).toBeInTheDocument();
  });

  it('names the dead stored model, not the one actually being served', () => {
    renderSection('stale');

    expect(screen.getByText(RETIRED_MODEL_ID)).toBeInTheDocument();
  });

  it('offers Reset on a stale row, which is the only way to clear the dead row', () => {
    renderSection('stale');

    expect(
      screen.getByRole('button', { name: /^reset .+ to default$/i })
    ).toBeInTheDocument();
  });

  it('gives every row its own Reset name so they are distinguishable', () => {
    render(
      <ModelsSection
        entries={[
          entryWith('custom', 'ai_default_model'),
          entryWith('custom', 'ai_fast_model'),
          entryWith('custom', 'ai_deep_model'),
        ]}
      />
    );

    const names = screen
      .getAllByRole('button', { name: /^reset .+ to default$/i })
      .map((button) => button.getAttribute('aria-label'));

    expect(names).toEqual([
      'Reset Default model to default',
      'Reset Fast model to default',
      'Reset Deep model to default',
    ]);
  });
});
