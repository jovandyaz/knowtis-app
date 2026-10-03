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

vi.mock('@/hooks/useAvailableModels', () => ({
  useAvailableModels: () => ({ data: catalog() }),
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
    catalog.mockReturnValue(CATALOG);
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
