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
  setConfigState: { isPending: false },
  resetConfigMutate: vi.fn(),
  resetConfigState: { isPending: false },
}));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAssignableModels: () => useAssignableModelsMock(),
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
    description: '',
    tier: 'balanced',
    provider: 'anthropic',
    routableByServer: true,
    needsKey: false,
    promoted: false,
  },
  {
    id: 'anthropic:haiku',
    label: 'Haiku',
    description: '',
    tier: 'fast',
    provider: 'anthropic',
    routableByServer: true,
    needsKey: false,
    promoted: false,
  },
  {
    id: 'openai:gpt',
    label: 'GPT',
    description: '',
    tier: 'fast',
    provider: 'openai',
    routableByServer: false,
    needsKey: true,
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
    resetConfigMutate.mockReset();
    resetConfigState.isPending = false;
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
      screen.getByRole('button', { name: /^reset to default: .+$/i })
    ).toBeInTheDocument();
  });

  it('hides Reset when the model already runs the code default', () => {
    renderSection('default');

    expect(
      screen.queryByRole('button', { name: /^reset to default: .+$/i })
    ).not.toBeInTheDocument();
  });

  it('resets the model key to its code default on click', async () => {
    renderSection('custom');

    await userEvent.click(
      screen.getByRole('button', { name: /^reset to default: .+$/i })
    );

    expect(resetConfigMutate).toHaveBeenCalledWith({ key: 'ai_default_model' });
  });

  it('disables Reset while the reset is in flight', () => {
    resetConfigState.isPending = true;

    renderSection('custom');

    expect(
      screen.getByRole('button', { name: /^reset to default: .+$/i })
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
      screen.getByRole('button', { name: /^reset to default: .+$/i })
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
        onConfigureProviders={onConfigureProviders}
      />
    );

    const names = screen
      .getAllByRole('button', { name: /^reset to default: .+$/i })
      .map((button) => button.getAttribute('aria-label'));

    expect(names).toEqual([
      'Reset to default: Default model',
      'Reset to default: Fast model',
      'Reset to default: Deep model',
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

    const locked = await screen.findByRole('menuitemradio', { name: /gpt/i });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(within(locked).getByTitle(NEEDS_KEY_HINT)).toBeInTheDocument();
  });

  it('does not write when the needs-key row is clicked', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: /gpt/i })
    );

    expect(setConfigMutate).not.toHaveBeenCalled();
  });

  it('assigns a routable model to the intent', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /sonnet/i }));
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: /haiku/i })
    );

    expect(setConfigMutate).toHaveBeenCalledWith({
      key: 'ai_default_model',
      value: 'anthropic:haiku',
    });
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
