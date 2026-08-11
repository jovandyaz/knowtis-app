import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { RoutingSection } from '../RoutingSection';

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
  {
    id: 'google:gemini',
    label: 'Gemini',
    tier: 'fast',
    routableByServer: true,
  },
];

function entryWith(
  value: string,
  source: AiConfigEntry['source'] = 'custom'
): AiConfigEntry {
  return {
    key: 'ai_fallback_chain',
    value,
    kind: 'chain',
    source,
    storedValue: null,
    description: null,
    updatedAt: null,
  };
}

const CHAIN = 'anthropic:sonnet,anthropic:haiku';

function renderChain(value = CHAIN) {
  return render(<RoutingSection entry={entryWith(value)} />);
}

function savedValue() {
  return setConfigMutate.mock.calls[0][0].value;
}

describe('RoutingSection', () => {
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

  it('lists the chain in fallback order', () => {
    renderChain();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Sonnet');
    expect(items[1]).toHaveTextContent('Haiku');
  });

  it('falls back to the raw id for a model the catalog dropped', () => {
    renderChain('anthropic:retired-model');

    expect(screen.getByRole('listitem')).toHaveTextContent(
      'anthropic:retired-model'
    );
  });

  it('marks a member the catalog dropped — routing skips it', () => {
    renderChain('anthropic:sonnet,anthropic:retired-model');

    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveTextContent(/won’t route/i);
    expect(items[1]).toHaveTextContent(/won’t route/i);
    expect(screen.getByRole('status')).toHaveTextContent(/are skipped/i);
  });

  // /ai/models lists a model the caller's own BYOK key unlocks, but a
  // server-global chain can never reach it.
  it('marks a member only a personal BYOK key reaches', () => {
    useSelectableModelsMock.mockReturnValue({
      data: [
        ...MODELS,
        {
          id: 'openai:gpt',
          label: 'GPT',
          tier: 'fast',
          routableByServer: false,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderChain('anthropic:sonnet,openai:gpt');

    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent(
      /won’t route/i
    );
  });

  it('does not accuse the whole chain while the catalog is still loading', () => {
    useSelectableModelsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    renderChain();

    expect(screen.queryByText(/won’t route/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('drops the draft when another admin writes, instead of reverting them', async () => {
    const { rerender } = render(<RoutingSection entry={entryWith(CHAIN)} />);

    await userEvent.click(
      screen.getByRole('button', { name: /move haiku earlier/i })
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Haiku');

    rerender(
      <RoutingSection entry={entryWith('google:gemini,anthropic:sonnet')} />
    );

    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Gemini');
    expect(
      screen.queryByRole('button', { name: /save chain/i })
    ).not.toBeInTheDocument();
  });

  it('keeps showing the saved order while the write is in flight', async () => {
    const { rerender } = render(<RoutingSection entry={entryWith(CHAIN)} />);

    await userEvent.click(
      screen.getByRole('button', { name: /move haiku earlier/i })
    );
    await userEvent.click(screen.getByRole('button', { name: /save chain/i }));

    // The server confirms nothing yet: the cache still holds the old value.
    rerender(<RoutingSection entry={entryWith(CHAIN)} />);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Haiku');

    rerender(
      <RoutingSection entry={entryWith('anthropic:haiku,anthropic:sonnet')} />
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Haiku');
    expect(
      screen.queryByRole('button', { name: /save chain/i })
    ).not.toBeInTheDocument();
  });

  it('does not write until the order is saved', async () => {
    renderChain();

    await userEvent.click(
      screen.getByRole('button', { name: /move haiku earlier/i })
    );

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Haiku');
    expect(setConfigMutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /save chain/i }));
    expect(savedValue()).toBe('anthropic:haiku,anthropic:sonnet');
  });

  it('restores the saved order when the edit is discarded', async () => {
    renderChain();

    await userEvent.click(
      screen.getByRole('button', { name: /move haiku earlier/i })
    );
    await userEvent.click(screen.getByRole('button', { name: /discard/i }));

    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Sonnet');
    expect(
      screen.queryByRole('button', { name: /save chain/i })
    ).not.toBeInTheDocument();
    expect(setConfigMutate).not.toHaveBeenCalled();
  });

  it('appends a model that is not already in the chain', async () => {
    renderChain();

    await userEvent.click(screen.getByRole('button', { name: /add model/i }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /gemini/i })
    );
    await userEvent.click(screen.getByRole('button', { name: /save chain/i }));

    expect(savedValue()).toBe(`${CHAIN},google:gemini`);
  });

  it('offers only models the chain does not already hold', async () => {
    renderChain();

    await userEvent.click(screen.getByRole('button', { name: /add model/i }));

    expect(
      await screen.findByRole('menuitem', { name: /gemini/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /sonnet/i })
    ).not.toBeInTheDocument();
  });

  it('removes a model from the chain', async () => {
    renderChain();

    await userEvent.click(
      screen.getByRole('button', { name: /remove sonnet/i })
    );
    await userEvent.click(screen.getByRole('button', { name: /save chain/i }));

    expect(savedValue()).toBe('anthropic:haiku');
  });

  it('refuses to save an empty chain — the server needs one routable model', async () => {
    renderChain('anthropic:sonnet');

    await userEvent.click(
      screen.getByRole('button', { name: /remove sonnet/i })
    );

    expect(screen.getByRole('button', { name: /save chain/i })).toBeDisabled();
    expect(screen.getByText(/chain is empty/i)).toBeInTheDocument();
  });

  // An edit landing mid-write forks from a value the server is about to
  // replace, so the draft is dropped on success and the edit vanishes.
  it('accepts no edit while the write is in flight', () => {
    setConfigState.isPending = true;

    renderChain();

    expect(
      screen.getByRole('button', { name: /move haiku earlier/i })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /move sonnet later/i })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /remove sonnet/i })
    ).toBeDisabled();
  });

  // AIConfigService.validateChain rejects a chain with no invocable member, so
  // offering Save here would only buy the admin a server error.
  it('refuses to save a chain no model can route', async () => {
    useSelectableModelsMock.mockReturnValue({
      data: MODELS.map((model) => ({ ...model, routableByServer: false })),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderChain();
    await userEvent.click(
      screen.getByRole('button', { name: /move haiku earlier/i })
    );

    expect(screen.getByRole('button', { name: /save chain/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      /server will not accept this chain/i
    );
    expect(setConfigMutate).not.toHaveBeenCalled();
  });

  it('still saves a chain where only some members route', async () => {
    useSelectableModelsMock.mockReturnValue({
      data: MODELS.map((model) => ({
        ...model,
        routableByServer: model.id === 'anthropic:sonnet',
      })),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderChain();
    await userEvent.click(
      screen.getByRole('button', { name: /move haiku earlier/i })
    );
    await userEvent.click(screen.getByRole('button', { name: /save chain/i }));

    expect(savedValue()).toBe('anthropic:haiku,anthropic:sonnet');
  });

  it('cannot move the first model earlier or the last one later', () => {
    renderChain();

    expect(
      screen.getByRole('button', { name: /move sonnet earlier/i })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /move haiku later/i })
    ).toBeDisabled();
  });

  it('marks a stored override with a filled custom badge', () => {
    renderChain();

    expect(screen.getByText('custom')).toHaveClass('bg-(--foreground)');
  });

  it('marks the code default with an outline badge', () => {
    render(<RoutingSection entry={entryWith(CHAIN, 'default')} />);

    expect(screen.getByText('default')).not.toHaveClass('bg-(--foreground)');
  });

  it('offers Reset to default when the chain is a stored override', () => {
    renderChain();

    expect(
      screen.getByRole('button', { name: /reset to default/i })
    ).toBeInTheDocument();
  });

  it('hides Reset when the chain already matches the code default', () => {
    render(<RoutingSection entry={entryWith(CHAIN, 'default')} />);

    expect(
      screen.queryByRole('button', { name: /reset to default/i })
    ).not.toBeInTheDocument();
  });

  it('resets the chain key to its code default on click', async () => {
    renderChain();

    await userEvent.click(
      screen.getByRole('button', { name: /reset to default/i })
    );

    expect(resetConfigMutate).toHaveBeenCalledWith({
      key: 'ai_fallback_chain',
    });
  });

  it('disables Reset while the reset is in flight', () => {
    resetConfigState.isPending = true;

    renderChain();

    expect(
      screen.getByRole('button', { name: /reset to default/i })
    ).toBeDisabled();
  });
});
