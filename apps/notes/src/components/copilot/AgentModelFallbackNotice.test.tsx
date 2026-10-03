import i18n from '@/lib/i18n';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ModelCatalogResponse,
  ModelFallbackReason,
} from '@knowtis/shared-types';

import { AgentModelFallbackNotice } from './AgentModelFallbackNotice';

const SUBSTITUTE = 'anthropic:claude-sonnet-5';
const catalog = vi.fn<() => ModelCatalogResponse | undefined>();
const catalogRequested = vi.fn<(enabled: boolean | undefined) => void>();
const authUser = vi.fn<() => { isAnonymous: boolean } | null>();

vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
}));
vi.mock('@/hooks/useAvailableModels', () => ({
  useAvailableModels: (enabled?: boolean) => {
    catalogRequested(enabled);
    return { data: enabled === false ? undefined : catalog() };
  },
}));

const CATALOG: ModelCatalogResponse = {
  tier: 'byok',
  intents: [],
  models: [
    {
      id: SUBSTITUTE,
      label: 'Claude Sonnet 5',
      descriptionKey: '',
      tier: 'balanced',
      contextWindow: 200_000,
      costClass: 2,
      isDefault: true,
      billedToUser: true,
      routableByServer: false,
    },
  ],
};

describe('AgentModelFallbackNotice', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    catalog.mockReturnValue(CATALOG);
    authUser.mockReturnValue({ isAnonymous: false });
  });

  it.each<[ModelFallbackReason, string]>([
    [
      'model_retired',
      'Answered by Claude Sonnet 5 because the model you picked is no longer available.',
    ],
    [
      'key_removed',
      'Answered by Claude Sonnet 5 because you removed the API key for the model you picked.',
    ],
    [
      'not_in_tier',
      "Answered by Claude Sonnet 5 because your plan doesn't include the model you picked.",
    ],
    [
      'intent_unavailable',
      "Answered by Claude Sonnet 5 because the option you picked isn't available right now.",
    ],
  ])('names the model that answered and why for %s', (reason, notice) => {
    render(<AgentModelFallbackNotice fallback={{ reason, to: SUBSTITUTE }} />);

    expect(screen.getByText(notice)).toBeInTheDocument();
  });

  it('names a substitution for a reason this build does not know without guessing it', () => {
    render(<AgentModelFallbackNotice fallback={{ to: SUBSTITUTE }} />);

    expect(
      screen.getByText(
        'Answered by Claude Sonnet 5 instead of the model you picked.'
      )
    ).toBeInTheDocument();
  });

  it.each([
    ['the catalog does not list the model', CATALOG.models.slice(1)],
    ['the catalog has not loaded', undefined],
  ])('falls back to the model id when %s', (_case, models) => {
    catalog.mockReturnValue(models ? { ...CATALOG, models } : undefined);

    render(
      <AgentModelFallbackNotice
        fallback={{ reason: 'model_retired', to: SUBSTITUTE }}
      />
    );

    expect(
      screen.getByText(
        `Answered by ${SUBSTITUTE} because the model you picked is no longer available.`
      )
    ).toBeInTheDocument();
  });

  it.each([
    ['a guest', { isAnonymous: true }],
    ['a missing session', null],
  ])(
    'names the model by its id without reading the catalog for %s',
    (_who, user) => {
      authUser.mockReturnValue(user);

      render(
        <AgentModelFallbackNotice
          fallback={{ reason: 'model_retired', to: SUBSTITUTE }}
        />
      );

      expect(catalogRequested).toHaveBeenCalledWith(false);
      expect(
        screen.getByText(
          `Answered by ${SUBSTITUTE} because the model you picked is no longer available.`
        )
      ).toBeInTheDocument();
    }
  );

  it('reads the catalog for an account', () => {
    render(
      <AgentModelFallbackNotice
        fallback={{ reason: 'model_retired', to: SUBSTITUTE }}
      />
    );

    expect(catalogRequested).toHaveBeenCalledWith(true);
  });

  it('arrives with the reply as plain text, not as a live region', () => {
    render(
      <AgentModelFallbackNotice
        fallback={{ reason: 'model_retired', to: SUBSTITUTE }}
      />
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
