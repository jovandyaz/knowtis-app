import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { RoutingSection } from '../RoutingSection';

const { useSelectableModelsMock, setConfigMutate } = vi.hoisted(() => ({
  useSelectableModelsMock: vi.fn(),
  setConfigMutate: vi.fn(),
}));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useSelectableModels: () => useSelectableModelsMock(),
    useSetAiConfig: () => ({
      mutate: setConfigMutate,
      isPending: false,
      isError: false,
      error: null,
    }),
  };
});

const MODELS = [
  { id: 'anthropic:sonnet', label: 'Sonnet', tier: 'balanced' },
  { id: 'anthropic:haiku', label: 'Haiku', tier: 'fast' },
  { id: 'google:gemini', label: 'Gemini', tier: 'fast' },
];

function entryWith(value: string): AiConfigEntry {
  return {
    key: 'ai_fallback_chain',
    value,
    kind: 'chain',
    source: 'database',
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

  it('marks a chain member the catalog dropped — the server skips it at routing time', () => {
    renderChain(`anthropic:sonnet,anthropic:retired-model`);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveTextContent(/not in catalog/i);
    expect(items[1]).toHaveTextContent(/not in catalog/i);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /skipped at routing time/i
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

    expect(screen.queryByText(/not in catalog/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  it('cannot move the first model earlier or the last one later', () => {
    renderChain();

    expect(
      screen.getByRole('button', { name: /move sonnet earlier/i })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /move haiku later/i })
    ).toBeDisabled();
  });
});
