import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';
import type * as DataAccessFeatureFlags from '@knowtis/data-access-feature-flags';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { AiConfigPage } from '../AiConfigPage';

const {
  useAiConfigMock,
  useSelectableModelsMock,
  useSystemProvidersMock,
  useFeatureFlagsMock,
  setConfigMutate,
} = vi.hoisted(() => ({
  useAiConfigMock: vi.fn(),
  useSelectableModelsMock: vi.fn(),
  useSystemProvidersMock: vi.fn(),
  useFeatureFlagsMock: vi.fn(),
  setConfigMutate: vi.fn(),
}));

const idleMutation = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  data: undefined,
};

const idleQuery = {
  data: undefined,
  isLoading: false,
  isError: false,
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
    useResetAiConfig: () => idleMutation,
    useSetSystemProvider: () => idleMutation,
    useClearSystemProviderKey: () => idleMutation,
    useTestSystemProvider: () => idleMutation,
    useAiHealth: () => idleQuery,
    useGlobalAiUsage: () => idleQuery,
    useUpsertFeatureFlag: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('@knowtis/data-access-feature-flags', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessFeatureFlags>();
  return {
    ...actual,
    useFeatureFlags: () => useFeatureFlagsMock(),
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

const renderPage = () => render(<AiConfigPage />);

describe('AiConfigPage', () => {
  beforeEach(() => {
    useAiConfigMock.mockReset();
    useSelectableModelsMock.mockReset();
    useFeatureFlagsMock.mockReset();
    setConfigMutate.mockReset();
    useAiConfigMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
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
    useFeatureFlagsMock.mockReturnValue({
      data: [
        {
          key: FEATURE_FLAG_KEYS.AI_ENABLED,
          enabled: true,
          description: null,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          key: FEATURE_FLAG_KEYS.AI_GLOBAL_SPEND_BREAKER,
          enabled: true,
          description: null,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          key: FEATURE_FLAG_KEYS.AGENT_WEB_SEARCH,
          enabled: true,
          description: null,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          key: FEATURE_FLAG_KEYS.AGENT_BYOK,
          enabled: false,
          description: null,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          key: FEATURE_FLAG_KEYS.VOICE_NOTES_ENABLED,
          enabled: false,
          description: null,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
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
          source: 'custom',
          description: 'Default model for AI completions',
          updatedAt: new Date('2026-07-15T00:00:00.000Z'),
        },
        {
          key: 'ai_fast_model',
          value: 'anthropic:claude-haiku-4-5-20251001',
          kind: 'model',
          source: 'default',
          description: null,
          updatedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();
    expect(
      screen.getByRole('heading', { name: /ai config/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Default model')).toBeInTheDocument();
    expect(
      within(screen.getByRole('tabpanel')).getByText(
        'anthropic:claude-sonnet-5'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Default model for AI completions')
    ).toBeInTheDocument();
    expect(screen.getByText('custom')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('routes each config entry to the editor for its kind', () => {
    useAiConfigMock.mockReturnValue({
      data: [
        {
          key: 'ai_default_model',
          value: 'anthropic:claude-sonnet-5',
          kind: 'model',
          source: 'custom',
          description: null,
          updatedAt: null,
        },
        {
          key: 'ai_fallback_chain',
          value: 'anthropic:claude-haiku-4-5-20251001',
          kind: 'chain',
          source: 'default',
          description: null,
          updatedAt: null,
        },
        {
          key: 'ai_reasoning_effort',
          value: 'medium',
          kind: 'choice',
          source: 'default',
          description: null,
          updatedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Default model')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Routing' })
    ).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Haiku 4.5');
    expect(
      screen.getByRole('heading', { name: 'Reasoning' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'medium' })).toHaveClass(
      'bg-(--foreground)'
    );
  });

  it('routes the list kind to the upstream editor', async () => {
    useAiConfigMock.mockReturnValue({
      data: [
        {
          key: 'ai_openrouter_providers',
          value: 'fireworks,baseten',
          kind: 'list',
          source: 'default',
          description: null,
          updatedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    await userEvent.click(screen.getByRole('tab', { name: 'Providers' }));
    expect(
      screen.getByRole('heading', { name: 'OpenRouter upstreams' })
    ).toBeInTheDocument();
  });

  it('renders the model editor when the api predates the chain key', () => {
    useAiConfigMock.mockReturnValue({
      data: [
        {
          key: 'ai_default_model',
          value: 'anthropic:claude-sonnet-5',
          kind: 'model',
          source: 'custom',
          description: null,
          updatedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

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
          source: 'custom',
          description: null,
          updatedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

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

    renderPage();

    expect(screen.getByText('Could not load AI config.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the status header with the master toggle', () => {
    renderPage();
    expect(screen.getByRole('switch', { name: 'AI enabled' })).toBeChecked();
  });

  it('shows guardrail flags under the Guardrails & Limits tab', async () => {
    renderPage();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Guardrails & Limits' })
    );
    expect(screen.getByText('Global spend breaker')).toBeInTheDocument();
    expect(screen.queryByText('Web search')).not.toBeInTheDocument();
  });

  it('shows an error state and retries the flags query from the Guardrails tab', async () => {
    const refetch = vi.fn();
    useFeatureFlagsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch,
    });

    renderPage();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Guardrails & Limits' })
    );

    expect(
      screen.getByText('Could not load feature flags.')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while the flags query is in flight', async () => {
    useFeatureFlagsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Guardrails & Limits' })
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(
      screen.queryByText('Could not load feature flags.')
    ).not.toBeInTheDocument();
  });

  it('shows capabilities with env chips and access flags in their tab, without product flags', async () => {
    renderPage();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Capabilities & Access' })
    );
    expect(screen.getByText('Web search')).toBeInTheDocument();
    expect(screen.getByText('requires TAVILY_API_KEY')).toBeInTheDocument();
    expect(screen.getByText('Bring your own key')).toBeInTheDocument();
    expect(screen.queryByText('voice_notes_enabled')).not.toBeInTheDocument();
  });
});
