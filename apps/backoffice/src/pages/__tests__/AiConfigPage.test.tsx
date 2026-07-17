import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { AiConfigPage } from '../AiConfigPage';

const {
  useAiConfigMock,
  useSelectableModelsMock,
  useSystemProvidersMock,
  setConfigMutate,
} = vi.hoisted(() => ({
  useAiConfigMock: vi.fn(),
  useSelectableModelsMock: vi.fn(),
  useSystemProvidersMock: vi.fn(),
  setConfigMutate: vi.fn(),
}));

const idleMutation = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  data: undefined,
};

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAiConfig: () => useAiConfigMock(),
    useSelectableModels: () => useSelectableModelsMock(),
    useSystemProviders: () => useSystemProvidersMock(),
    useSetAiConfig: vi.fn().mockReturnValue({
      mutate: setConfigMutate,
      isPending: false,
      isError: false,
      error: null,
    }),
    useSetSystemProvider: () => idleMutation,
    useClearSystemProviderKey: () => idleMutation,
    useTestSystemProvider: () => idleMutation,
  };
});

const MODELS = [
  { id: 'anthropic:claude-sonnet-5', label: 'Sonnet 5', tier: 'balanced' },
  {
    id: 'anthropic:claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    tier: 'fast',
  },
];

describe('AiConfigPage', () => {
  beforeEach(() => {
    useAiConfigMock.mockReset();
    useSelectableModelsMock.mockReset();
    setConfigMutate.mockReset();
    useSelectableModelsMock.mockReturnValue({
      data: MODELS,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSystemProvidersMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('renders each config entry with its effective value and source', () => {
    useAiConfigMock.mockReturnValue({
      data: [
        {
          key: 'ai_default_model',
          value: 'anthropic:claude-sonnet-5',
          kind: 'model',
          source: 'database',
          description: 'Default model for AI completions',
          updatedAt: new Date('2026-07-15T00:00:00.000Z'),
        },
        {
          key: 'ai_fast_model',
          value: 'anthropic:claude-haiku-4-5-20251001',
          kind: 'model',
          source: 'environment',
          description: null,
          updatedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AiConfigPage />);
    expect(
      screen.getByRole('heading', { name: /ai config/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Default model')).toBeInTheDocument();
    expect(screen.getByText('anthropic:claude-sonnet-5')).toBeInTheDocument();
    expect(
      screen.getByText('Default model for AI completions')
    ).toBeInTheDocument();
    expect(screen.getByText('database')).toBeInTheDocument();
    expect(screen.getByText('environment')).toBeInTheDocument();
  });

  it('routes each config entry to the editor for its kind', () => {
    useAiConfigMock.mockReturnValue({
      data: [
        {
          key: 'ai_default_model',
          value: 'anthropic:claude-sonnet-5',
          kind: 'model',
          source: 'database',
          description: null,
          updatedAt: null,
        },
        {
          key: 'ai_fallback_chain',
          value: 'anthropic:claude-haiku-4-5-20251001',
          kind: 'chain',
          source: 'environment',
          description: null,
          updatedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AiConfigPage />);

    expect(screen.getByText('Default model')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Routing' })
    ).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Haiku 4.5');
  });

  it('renders the model editor when the api predates the chain key', () => {
    useAiConfigMock.mockReturnValue({
      data: [
        {
          key: 'ai_default_model',
          value: 'anthropic:claude-sonnet-5',
          kind: 'model',
          source: 'database',
          description: null,
          updatedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AiConfigPage />);

    expect(screen.getByText('Default model')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Routing' })
    ).not.toBeInTheDocument();
  });

  it('mutates the config key when a model is selected', async () => {
    useAiConfigMock.mockReturnValue({
      data: [
        {
          key: 'ai_default_model',
          value: 'anthropic:claude-sonnet-5',
          kind: 'model',
          source: 'database',
          description: null,
          updatedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AiConfigPage />);

    await userEvent.click(screen.getByRole('button', { name: /sonnet 5/i }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /haiku 4\.5/i })
    );

    expect(setConfigMutate).toHaveBeenCalledWith({
      key: 'ai_default_model',
      value: 'anthropic:claude-haiku-4-5-20251001',
    });
  });

  it('shows an error state and retries the failed query', async () => {
    const refetch = vi.fn();
    useAiConfigMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch,
    });

    render(<AiConfigPage />);

    expect(screen.getByText('Could not load AI config.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
