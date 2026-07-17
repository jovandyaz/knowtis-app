import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { AiConfigPage } from '../AiConfigPage';

const { useAiConfigMock, useSelectableModelsMock, setConfigMutate } =
  vi.hoisted(() => ({
    useAiConfigMock: vi.fn(),
    useSelectableModelsMock: vi.fn(),
    setConfigMutate: vi.fn(),
  }));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useAiConfig: () => useAiConfigMock(),
    useSelectableModels: () => useSelectableModelsMock(),
    useSetAiConfig: vi.fn().mockReturnValue({
      mutate: setConfigMutate,
      isPending: false,
      isError: false,
      error: null,
    }),
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

  it('omits non-model config entries until their editor ships', () => {
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
          value: 'anthropic:claude-haiku-4-5-20251001,openai:gpt-4o-mini',
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
    expect(screen.queryByText('ai_fallback_chain')).not.toBeInTheDocument();
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
