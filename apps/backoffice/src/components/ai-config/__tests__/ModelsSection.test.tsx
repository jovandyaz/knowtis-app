import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { ModelsSection } from '../ModelsSection';

const {
  useAssignableModelsMock,
  setConfigMutate,
  setConfigState,
  resetConfigMutate,
  resetConfigState,
} = vi.hoisted(() => ({
  useAssignableModelsMock: vi.fn(),
  setConfigMutate: vi.fn(),
  setConfigState: {
    isPending: false,
    isError: false,
    error: null as Error | null,
  },
  resetConfigMutate: vi.fn(),
  resetConfigState: {
    isPending: false,
    isError: false,
    error: null as Error | null,
  },
}));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAssignableModels: () => useAssignableModelsMock(),
    useSetAiConfig: () => ({
      mutate: setConfigMutate,
      reset: () => {
        setConfigState.isError = false;
        setConfigState.error = null;
      },
      isPending: setConfigState.isPending,
      isError: setConfigState.isError,
      error: setConfigState.error,
    }),
    useResetAiConfig: () => ({
      mutate: resetConfigMutate,
      reset: () => {
        resetConfigState.isError = false;
        resetConfigState.error = null;
      },
      isPending: resetConfigState.isPending,
      isError: resetConfigState.isError,
      error: resetConfigState.error,
    }),
  };
});

const MODELS = [
  {
    id: 'anthropic:sonnet',
    label: 'Sonnet',
    description: '',
    tier: 'balanced',
    provider: 'anthropic',
    routableByServer: true,
    promoted: false,
  },
  {
    id: 'anthropic:haiku',
    label: 'Haiku',
    description: '',
    tier: 'fast',
    provider: 'anthropic',
    routableByServer: true,
    promoted: false,
  },
  {
    id: 'openai:gpt',
    label: 'GPT',
    description: '',
    tier: 'fast',
    provider: 'openai',
    routableByServer: false,
    promoted: false,
  },
  {
    id: 'openrouter:vendor/promoted',
    label: 'Promoted Vendor',
    description: 'Promoted from the catalog',
    tier: 'open',
    provider: 'openrouter',
    routableByServer: false,
    promoted: true,
  },
  {
    id: 'anthropic:unclassified',
    label: 'Unclassified Model',
    description: '',
    tier: null,
    provider: 'anthropic',
    routableByServer: true,
    promoted: false,
  },
];

const NEEDS_KEY_HINT = 'Needs a provider key — configure it in Providers';

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

const onConfigureProviders = vi.fn();

function renderSection(source: AiConfigEntry['source'] = 'custom') {
  return render(
    <ModelsSection
      entries={[entryWith(source)]}
      onConfigureProviders={onConfigureProviders}
    />
  );
}

describe('ModelsSection', () => {
  beforeEach(() => {
    setConfigMutate.mockReset();
    setConfigState.isPending = false;
    setConfigState.isError = false;
    setConfigState.error = null;
    resetConfigMutate.mockReset();
    resetConfigState.isPending = false;
    resetConfigState.isError = false;
    resetConfigState.error = null;
    onConfigureProviders.mockReset();
    useAssignableModelsMock.mockReturnValue({
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

  it('marks a pin with a filled pinned badge', () => {
    renderSection('custom');

    expect(screen.getByText('pinned')).toHaveClass('bg-(--foreground)');
  });

  it('marks an auto setting with an outline auto badge', () => {
    renderSection('default');

    expect(screen.getByText('auto')).not.toHaveClass('bg-(--foreground)');
  });

  it('offers Release pin only for a pin', () => {
    renderSection('custom');

    expect(
      screen.getByRole('button', { name: /^release pin: .+$/i })
    ).toBeInTheDocument();
  });

  it('hides Release pin while the model is auto', () => {
    renderSection('default');

    expect(
      screen.queryByRole('button', { name: /^release pin: .+$/i })
    ).not.toBeInTheDocument();
  });

  it('releases the pin on click', async () => {
    renderSection('custom');

    await userEvent.click(
      screen.getByRole('button', { name: /^release pin: .+$/i })
    );

    expect(resetConfigMutate).toHaveBeenCalledWith({ key: 'ai_default_model' });
  });

  it('disables Release pin while the reset is in flight', () => {
    resetConfigState.isPending = true;

    renderSection('custom');

    expect(
      screen.getByRole('button', { name: /^release pin: .+$/i })
    ).toBeDisabled();
  });
  it('clears a stale reset error once a save succeeds', async () => {
    resetConfigState.isError = true;
    resetConfigState.error = new Error('Could not update the model.');

    const { rerender } = renderSection();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not update the model.'
    );

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));
    await userEvent.click(
      await screen.findByRole('option', { name: /haiku/i })
    );
    rerender(
      <ModelsSection
        entries={[entryWith('custom')]}
        onConfigureProviders={onConfigureProviders}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a failed reset', () => {
    resetConfigState.isError = true;
    resetConfigState.error = new Error('Could not update the model.');

    renderSection('custom');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not update the model.'
    );
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

  it('offers Release pin on a stale row, which is the only way to clear the dead row', () => {
    renderSection('stale');

    expect(screen.getByText('stale')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^release pin: .+$/i })
    ).toBeInTheDocument();
  });

  it('gives every row its own Release pin name so they are distinguishable', () => {
    render(
      <ModelsSection
        entries={[
          entryWith('custom', 'ai_default_model'),
          entryWith('custom', 'ai_fast_model'),
          entryWith('custom', 'ai_deep_model'),
        ]}
        onConfigureProviders={onConfigureProviders}
      />
    );

    const names = screen
      .getAllByRole('button', { name: /^release pin: .+$/i })
      .map((button) => button.getAttribute('aria-label'));

    expect(names).toEqual([
      'Release pin: Default model',
      'Release pin: Fast model',
      'Release pin: Deep model',
    ]);
  });

  it('keeps the config key reachable without spending a line on it', () => {
    render(
      <ModelsSection
        entries={[entryWith('custom', 'ai_default_model')]}
        onConfigureProviders={onConfigureProviders}
      />
    );

    expect(screen.getByText('Default model')).toHaveAttribute(
      'title',
      'ai_default_model'
    );
    expect(screen.queryByText('ai_default_model')).not.toBeInTheDocument();
  });

  it('shows the model id beside the select, with the full value on hover', () => {
    render(
      <ModelsSection
        entries={[entryWith('custom', 'ai_default_model')]}
        onConfigureProviders={onConfigureProviders}
      />
    );

    const id = screen.getByTitle('anthropic:sonnet');
    expect(id).toHaveTextContent('anthropic:sonnet');
    expect(id).toHaveClass('truncate');
  });

  it('lists a needs-key model disabled, still visible for discovery', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));

    const locked = await screen.findByRole('option', { name: /gpt/i });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(within(locked).getByTitle(NEEDS_KEY_HINT)).toBeInTheDocument();
  });

  it('lists a promoted model its provider can no longer route as disabled too', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));

    const locked = await screen.findByRole('option', {
      name: /promoted vendor/i,
    });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(within(locked).getByTitle(NEEDS_KEY_HINT)).toBeInTheDocument();
    expect(locked).not.toHaveTextContent('Promoted from the catalog');
  });

  it('does not write when the needs-key row is clicked', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));
    await userEvent.click(await screen.findByRole('option', { name: /gpt/i }));

    expect(setConfigMutate).not.toHaveBeenCalled();
  });

  it('assigns a routable model to the intent', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));
    await userEvent.click(
      await screen.findByRole('option', { name: /haiku/i })
    );

    expect(setConfigMutate).toHaveBeenCalledWith({
      key: 'ai_default_model',
      value: 'anthropic:haiku',
    });
  });

  it('opens the model picker on a search box', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));

    const search = await screen.findByRole('combobox', {
      name: 'Search by name or ID',
    });
    expect(search).toHaveFocus();
  });

  it('narrows the model picker to the rows matching the search', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));
    await userEvent.type(await screen.findByRole('combobox'), 'openai');

    const rows = screen.getAllByRole('option');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('GPT');
  });

  it('groups an unclassified model under other', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));

    const heading = await screen.findByText('other');
    const group = heading.closest('[cmdk-group]') as HTMLElement;
    expect(within(group).getByText('Unclassified Model')).toBeInTheDocument();
    const headings = ['fast', 'balanced', 'open', 'other'].map((name) =>
      screen.getByText(name)
    );
    headings.forEach((node, index) => {
      const next = headings[index + 1];
      if (next) {
        expect(
          node.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
      }
    });
  });

  it('says so when no model matches the search', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));
    await userEvent.type(await screen.findByRole('combobox'), 'no-such-model');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No models match your search')).toBeInTheDocument();
  });

  it('links to the Providers tab for key configuration', async () => {
    renderSection();

    await userEvent.click(
      screen.getByRole('button', { name: /configure provider keys/i })
    );

    expect(onConfigureProviders).toHaveBeenCalled();
  });

  it('shows the update date without the time of day', () => {
    const updatedAt = new Date('2026-08-11T11:44:20Z');
    render(
      <ModelsSection
        entries={[{ ...entryWith('custom', 'ai_default_model'), updatedAt }]}
        onConfigureProviders={onConfigureProviders}
      />
    );

    expect(
      screen.getByText(updatedAt.toLocaleDateString())
    ).toBeInTheDocument();
    expect(
      screen.queryByText(updatedAt.toLocaleString())
    ).not.toBeInTheDocument();
  });
});
