import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type { SystemProvider } from '@knowtis/data-access-admin';

import { ProviderCard } from '../ProviderCard';

const { setMutate, clearMutate, testMutate, state } = vi.hoisted(() => ({
  setMutate: vi.fn(),
  clearMutate: vi.fn(),
  testMutate: vi.fn(),
  state: {
    set: { isPending: false, isError: false, error: null as Error | null },
    test: {
      isPending: false,
      isError: false,
      error: null as Error | null,
      data: undefined as
        | { ok: true; model: string }
        | { ok: false; reason: string; message: string }
        | undefined,
    },
  },
}));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useSetSystemProvider: () => ({ mutate: setMutate, ...state.set }),
    useClearSystemProviderKey: () => ({
      mutate: clearMutate,
      isPending: false,
      isError: false,
      error: null,
    }),
    useTestSystemProvider: () => ({ mutate: testMutate, ...state.test }),
  };
});

function providerWith(overrides: Partial<SystemProvider> = {}): SystemProvider {
  return {
    provider: 'anthropic',
    enabled: true,
    keySource: 'environment',
    storedKeyUnreadable: false,
    keyPrefix: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('ProviderCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.set = { isPending: false, isError: false, error: null };
    state.test = {
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
    };
  });

  it('names the provider and where its key comes from', () => {
    render(
      <ProviderCard
        provider={providerWith({
          keySource: 'database',
          keyPrefix: 'sk-ant-1',
        })}
      />
    );

    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('database')).toBeInTheDocument();
    expect(screen.getByText('sk-ant-1…')).toBeInTheDocument();
  });

  it('says a disabled provider is out of routing, not that its env key serves', () => {
    render(
      <ProviderCard
        provider={providerWith({ enabled: false, keySource: 'environment' })}
      />
    );

    expect(screen.getByText(/out of routing/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/routing uses the key from the environment/i)
    ).not.toBeInTheDocument();
  });

  it('toggles enablement', async () => {
    render(<ProviderCard provider={providerWith()} />);

    await userEvent.click(
      screen.getByRole('switch', { name: /anthropic enabled/i })
    );

    expect(setMutate).toHaveBeenCalledWith({
      provider: 'anthropic',
      enabled: false,
    });
  });

  it('submits a typed key and clears the field on success', async () => {
    render(<ProviderCard provider={providerWith()} />);

    await userEvent.type(
      screen.getByLabelText(/anthropic api key/i),
      '  sk-ant-new  '
    );
    await userEvent.click(screen.getByRole('button', { name: /save key/i }));

    expect(setMutate).toHaveBeenCalledWith(
      { provider: 'anthropic', apiKey: 'sk-ant-new' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );

    act(() => setMutate.mock.calls[0][1].onSuccess());
    expect(screen.getByLabelText(/anthropic api key/i)).toHaveValue('');
  });

  it('cannot submit an empty key', () => {
    render(<ProviderCard provider={providerWith()} />);

    expect(screen.getByRole('button', { name: /save key/i })).toBeDisabled();
  });

  it('probes the provider and reports which model answered', async () => {
    render(<ProviderCard provider={providerWith()} />);

    await userEvent.click(
      screen.getByRole('button', { name: /test connection/i })
    );
    expect(testMutate).toHaveBeenCalledWith('anthropic');

    state.test.data = { ok: true, model: 'anthropic:haiku' };
    render(<ProviderCard provider={providerWith()} />);

    expect(
      screen.getByText(/anthropic answered via anthropic:haiku/i)
    ).toBeInTheDocument();
  });

  it('shows why a probe failed — a refusal resolves, it does not throw', () => {
    state.test.data = {
      ok: false,
      reason: 'rejected',
      message: 'anthropic refused the probe: Your credit balance is too low',
    };

    render(<ProviderCard provider={providerWith()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /credit balance is too low/i
    );
  });

  it('surfaces why a key was refused', () => {
    state.set.isError = true;
    state.set.error = new Error('The anthropic key was rejected.');

    render(<ProviderCard provider={providerWith()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The anthropic key was rejected.'
    );
  });

  it('warns that an undecryptable key is being ignored', () => {
    render(
      <ProviderCard
        provider={providerWith({
          keySource: 'environment',
          storedKeyUnreadable: true,
        })}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be decrypted/i);
  });

  it('offers to clear only a key that is actually stored', () => {
    const { rerender } = render(
      <ProviderCard provider={providerWith({ keySource: 'environment' })} />
    );
    expect(
      screen.queryByRole('button', { name: /clear stored key/i })
    ).not.toBeInTheDocument();

    rerender(
      <ProviderCard provider={providerWith({ keySource: 'database' })} />
    );
    expect(
      screen.getByRole('button', { name: /clear stored key/i })
    ).toBeInTheDocument();
  });

  it('offers to clear an undecryptable key even though it is not routing', async () => {
    render(
      <ProviderCard
        provider={providerWith({
          keySource: 'none',
          storedKeyUnreadable: true,
        })}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: /clear stored key/i })
    );

    expect(clearMutate).toHaveBeenCalledWith('anthropic');
  });
});
