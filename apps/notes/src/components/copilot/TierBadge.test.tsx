import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { clockTimeOf } from '@/lib/format-date';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aiKeysApi, aiModelsApi, aiQuotaApi } from '@knowtis/api-client';
import { TooltipProvider } from '@knowtis/design-system';
import type {
  AIPreferences,
  AiQuota,
  ByokProvider,
  ModelCatalogResponse,
  ModelIntent,
  ProviderKeyInfo,
  SelectableModel,
} from '@knowtis/shared-types';

import { TierBadge } from './TierBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? `${key}(${Object.entries(opts)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')})`
        : key,
    i18n: { language: 'en' },
  }),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ id: 'user-1' }),
}));
vi.mock('@knowtis/api-client', () => ({
  aiQuotaApi: { getQuota: vi.fn() },
  aiModelsApi: { getPreferences: vi.fn(), getModels: vi.fn() },
  aiKeysApi: { list: vi.fn() },
}));

const RESETS_AT = new Date(2026, 9, 3).toISOString();
const RESETS_AT_ONE = new Date(2026, 9, 3, 1).toISOString();

function metered(
  tier: 'anonymous' | 'free',
  used: number,
  limit: number,
  resetsAt = RESETS_AT
): AiQuota {
  return { tier, messages: { used, limit, resetsAt } };
}

const BYOK: AiQuota = { tier: 'byok', messages: null };

const DIRECT_SONNET = 'anthropic:claude-sonnet-5-5';
const ROUTED_SONNET = 'openrouter:anthropic/claude-sonnet-5.5';

function preferences(
  primaryProvider: ByokProvider | null,
  preferredModel: string | null = null
): AIPreferences {
  return {
    preferredModel,
    preferredIntent: null,
    primaryProvider,
    ghostTextEnabled: true,
  };
}

function model(id: string, servesIntent?: ModelIntent): SelectableModel {
  return {
    id,
    label: id,
    descriptionKey: '',
    tier: servesIntent ?? 'balanced',
    contextWindow: 1000,
    costClass: 1,
    isDefault: false,
    billedToUser: true,
    routableByServer: false,
    ...(servesIntent && { servesIntent }),
  };
}

function byokCatalog(models: SelectableModel[]): ModelCatalogResponse {
  return { tier: 'byok', models, intents: [] };
}

function key(provider: ByokProvider, createdAt: string): ProviderKeyInfo {
  return { provider, keyPrefix: 'sk-***', lastUsedAt: null, createdAt };
}

function renderBadge() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  return render(<TierBadge />, { wrapper });
}

describe('TierBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiModelsApi.getPreferences).mockResolvedValue(preferences(null));
    vi.mocked(aiModelsApi.getModels).mockResolvedValue(byokCatalog([]));
    vi.mocked(aiKeysApi.list).mockResolvedValue([]);
  });

  it('shows a guest how many of their messages they used today', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(
      metered('anonymous', 3, 5)
    );

    renderBadge();

    const badge = await screen.findByLabelText(
      'ai.copilot.quota.usedLabel(tier=ai.copilot.quota.tier.anonymous,used=3,count=5)'
    );
    expect(badge).toHaveTextContent(
      'ai.copilot.quota.badge.metered(tier=ai.copilot.quota.tier.anonymous,used=3,limit=5)'
    );
    expect(badge).not.toHaveClass('text-(--warning)');
    expect(aiKeysApi.list).not.toHaveBeenCalled();
    expect(aiModelsApi.getPreferences).not.toHaveBeenCalled();
    expect(aiModelsApi.getModels).not.toHaveBeenCalled();
  });

  it('warns once the day runs low', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(metered('free', 25, 30));

    renderBadge();

    const badge = await screen.findByLabelText(
      'ai.copilot.quota.usedLabel(tier=ai.copilot.quota.tier.free,used=25,count=30)'
    );
    expect(badge).toHaveTextContent(
      'ai.copilot.quota.badge.metered(tier=ai.copilot.quota.tier.free,used=25,limit=30)'
    );
    expect(badge).toHaveClass('text-(--warning)');
  });

  it('says when the messages reset', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(metered('free', 12, 30));
    renderBadge();
    const badge = await screen.findByLabelText(
      'ai.copilot.quota.usedLabel(tier=ai.copilot.quota.tier.free,used=12,count=30)'
    );

    act(() => badge.focus());

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      `ai.copilot.quota.resetsAt(time=${clockTimeOf(RESETS_AT, 'en').time})`
    );
  });

  it('names a reset at one o’clock in its own form', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(
      metered('free', 12, 30, RESETS_AT_ONE)
    );
    renderBadge();
    const badge = await screen.findByLabelText(
      'ai.copilot.quota.usedLabel(tier=ai.copilot.quota.tier.free,used=12,count=30)'
    );

    act(() => badge.focus());

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      `ai.copilot.quota.resetsAt(time=${clockTimeOf(RESETS_AT_ONE, 'en').time},context=atOne)`
    );
  });

  it('names the primary provider a byok caller holds while no model resolves', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(BYOK);
    vi.mocked(aiModelsApi.getPreferences).mockResolvedValue(
      preferences('anthropic')
    );
    vi.mocked(aiKeysApi.list).mockResolvedValue([
      key('openai', '2026-01-01T00:00:00.000Z'),
      key('anthropic', '2026-02-01T00:00:00.000Z'),
    ]);

    renderBadge();

    const badge = await screen.findByLabelText(
      'ai.copilot.quota.byokLabel(provider=Anthropic)'
    );
    expect(badge).toHaveTextContent(
      'ai.copilot.quota.badge.byok(provider=Anthropic)'
    );
    expect(badge).not.toHaveClass('text-(--warning)');
  });

  it('falls back to the first key added when the primary provider is no longer held', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(BYOK);
    vi.mocked(aiModelsApi.getPreferences).mockResolvedValue(
      preferences('openai')
    );
    vi.mocked(aiKeysApi.list).mockResolvedValue([
      key('openrouter', '2026-03-01T00:00:00.000Z'),
      key('google', '2026-01-01T00:00:00.000Z'),
    ]);

    renderBadge();

    expect(
      await screen.findByText('ai.copilot.quota.badge.byok(provider=Google)')
    ).toBeInTheDocument();
  });

  it('names the provider serving the selected intent, not the primary', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(BYOK);
    vi.mocked(aiModelsApi.getPreferences).mockResolvedValue(
      preferences('openai')
    );
    vi.mocked(aiKeysApi.list).mockResolvedValue([
      key('openai', '2026-01-01T00:00:00.000Z'),
      key('anthropic', '2026-02-01T00:00:00.000Z'),
    ]);
    vi.mocked(aiModelsApi.getModels).mockResolvedValue(
      byokCatalog([
        model('openai:gpt-6-luna', 'fast'),
        model(DIRECT_SONNET, 'balanced'),
      ])
    );
    renderBadge();
    const badge = await screen.findByLabelText(
      'ai.copilot.quota.byokLabel(provider=Anthropic)'
    );

    act(() => badge.focus());

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'ai.copilot.quota.paysWithKey(provider=Anthropic)'
    );
  });

  it('names the provider of an Advanced pick, not the primary', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(BYOK);
    vi.mocked(aiModelsApi.getPreferences).mockResolvedValue(
      preferences('anthropic', ROUTED_SONNET)
    );
    vi.mocked(aiKeysApi.list).mockResolvedValue([
      key('anthropic', '2026-01-01T00:00:00.000Z'),
      key('openrouter', '2026-02-01T00:00:00.000Z'),
    ]);
    vi.mocked(aiModelsApi.getModels).mockResolvedValue(
      byokCatalog([model(DIRECT_SONNET, 'balanced'), model(ROUTED_SONNET)])
    );
    renderBadge();
    const badge = await screen.findByLabelText(
      'ai.copilot.quota.byokLabel(provider=OpenRouter)'
    );

    act(() => badge.focus());

    expect(badge).toHaveTextContent(
      'ai.copilot.quota.badge.byok(provider=OpenRouter)'
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'ai.copilot.quota.paysWithKey(provider=OpenRouter)'
    );
  });

  it('tells a byok caller who pays', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(BYOK);
    vi.mocked(aiKeysApi.list).mockResolvedValue([
      key('openai', '2026-01-01T00:00:00.000Z'),
    ]);
    renderBadge();
    const badge = await screen.findByLabelText(
      'ai.copilot.quota.byokLabel(provider=OpenAI)'
    );

    act(() => badge.focus());

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'ai.copilot.quota.paysWithKey(provider=OpenAI)'
    );
  });

  it('shows nothing while the quota is unknown', () => {
    vi.mocked(aiQuotaApi.getQuota).mockReturnValue(
      new Promise(() => undefined)
    );

    const { container } = renderBadge();

    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when the quota cannot be read', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockRejectedValue(new Error('503'));

    const { container } = renderBadge();

    await vi.waitFor(() => expect(aiQuotaApi.getQuota).toHaveBeenCalled());
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing for a byok caller until a held provider is known', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(BYOK);
    vi.mocked(aiKeysApi.list).mockReturnValue(new Promise(() => undefined));

    const { container } = renderBadge();

    await vi.waitFor(() => expect(aiKeysApi.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing for a byok caller until the model it runs is known', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(BYOK);
    vi.mocked(aiKeysApi.list).mockResolvedValue([
      key('openai', '2026-01-01T00:00:00.000Z'),
    ]);
    vi.mocked(aiModelsApi.getModels).mockReturnValue(
      new Promise(() => undefined)
    );

    const { container } = renderBadge();

    await vi.waitFor(() => expect(aiModelsApi.getModels).toHaveBeenCalled());
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });
});
