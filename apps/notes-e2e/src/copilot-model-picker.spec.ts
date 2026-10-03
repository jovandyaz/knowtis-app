import { expect } from '@playwright/test';
import { z } from 'zod';

import type {
  AIPreferences,
  AiQuota,
  ModelCatalogResponse,
  ProviderKeyInfo,
  SelectableModel,
} from '@knowtis/shared-types';

import { E2E } from '../support/environment';
import {
  openCopilotDock,
  routeApiJson,
  scriptAgent,
  test,
} from './fixtures/copilot.fixture';

const MODELS_ROUTE_RE = /\/ai\/models(?:\?|$)/;
const QUOTA_ROUTE_RE = /\/ai\/quota(?:\?|$)/;
const KEYS_ROUTE_RE = /\/ai\/keys(?:\?|$)/;
const PREFERENCES_ROUTE_RE = /\/ai\/preferences(?:\?|$)/;
const sentMessageSchema = z.object({ turnId: z.string().min(1) });
const DASHBOARD_PATH = '/dashboard';
const DAY_MS = 24 * 60 * 60 * 1000;
const RESETS_AT = new Date(
  Math.ceil(Date.now() / DAY_MS) * DAY_MS
).toISOString();

const PICKER_RE = /^(model and effort|modelo y esfuerzo):/i;
const BALANCED_RE = /^(balanced|balanceado)$/i;
const FAST_ROW_RE = /^(fast|rápido)/i;
const BALANCED_ROW_RE = /^(balanced|balanceado)/i;
const DEEP_ROW_RE = /^(deep|profundo)/i;
const ADVANCED_RE = /^(advanced|avanzado)$/i;
const BYOK_ENTRY_RE =
  /^(more models with your api key|más modelos con tu api key) →$/i;
const SETTINGS_RE = /^(settings|configuración)$/i;
const API_KEYS_RE = /^(your api keys|tus claves de api)$/i;
const ACCOUNT_RE = /^(account|cuenta):/i;
const AI_SECTION_RE = /^(ai assistant|asistente ia)$/i;
const PLAN_RE = /^plan$/i;
const PRIMARY_PROVIDER_RE = /^(primary provider|proveedor principal)$/i;
const PLATFORM_PAYS_RE = /^(knowtis pays\.|paga knowtis\.)$/i;
const KEY_PAYS_RE = /^(you pay|pagas tú):/i;
const FREE_NAME_RE = /^(free|gratis)$/i;
const KEY_NAME_RE = /^(your key|tu key)$/i;
const YOUR_PLAN_RE = /^(your plan|tu plan)$/i;
const FALLBACK_NOTICE_RE =
  /^(answered by deepseek v3\.2 because your plan doesn't include|respondió deepseek v3\.2 porque tu plan no incluye)/i;

function model(
  id: string,
  label: string,
  fields: Partial<SelectableModel> = {}
): SelectableModel {
  return {
    id,
    label,
    descriptionKey: '',
    tier: 'balanced',
    contextWindow: 200000,
    costClass: 2,
    isDefault: false,
    billedToUser: false,
    routableByServer: true,
    ...fields,
  };
}

const FREE_CATALOG: ModelCatalogResponse = {
  tier: 'free',
  models: [
    model('openrouter:minimax/minimax-m2.5', 'MiniMax M2.5', {
      tier: 'fast',
      servesIntent: 'fast',
    }),
    model('openrouter:deepseek/deepseek-v3.2', 'DeepSeek V3.2', {
      isDefault: true,
      servesIntent: 'balanced',
    }),
    model('openrouter:moonshotai/kimi-k2.5', 'Kimi K2.5', {
      tier: 'powerful',
      servesIntent: 'powerful',
    }),
  ],
  intents: [
    {
      intent: 'fast',
      available: true,
      modelId: 'openrouter:minimax/minimax-m2.5',
      substituted: false,
    },
    {
      intent: 'balanced',
      available: true,
      modelId: 'openrouter:deepseek/deepseek-v3.2',
      substituted: false,
    },
    {
      intent: 'powerful',
      available: true,
      modelId: 'openrouter:moonshotai/kimi-k2.5',
      substituted: false,
    },
  ],
};

const BYOK_CATALOG: ModelCatalogResponse = {
  tier: 'byok',
  models: [
    model('openrouter:anthropic/claude-haiku-4.5', 'Haiku 4.5', {
      tier: 'fast',
      billedToUser: true,
      servesIntent: 'fast',
    }),
    model('openrouter:anthropic/claude-sonnet-5', 'Sonnet 5', {
      isDefault: true,
      billedToUser: true,
      servesIntent: 'balanced',
    }),
    model('openrouter:anthropic/claude-opus-5', 'Opus 5', {
      tier: 'powerful',
      billedToUser: true,
      servesIntent: 'powerful',
    }),
    model('anthropic:claude-haiku-4-5', 'Haiku 4.5', {
      tier: 'fast',
      billedToUser: true,
    }),
    model('openrouter:openai/gpt-5.6-terra', 'GPT-5.6 Terra', {
      billedToUser: true,
    }),
  ],
  intents: [
    {
      intent: 'fast',
      available: true,
      modelId: 'openrouter:anthropic/claude-haiku-4.5',
      substituted: false,
    },
    {
      intent: 'balanced',
      available: true,
      modelId: 'openrouter:anthropic/claude-sonnet-5',
      substituted: false,
    },
    {
      intent: 'powerful',
      available: true,
      modelId: 'openrouter:anthropic/claude-opus-5',
      substituted: false,
    },
  ],
};

const KEYS: ProviderKeyInfo[] = [
  {
    provider: 'openrouter',
    keyPrefix: 'sk-or-v1',
    lastUsedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    provider: 'anthropic',
    keyPrefix: 'sk-ant-a',
    lastUsedAt: null,
    createdAt: '2026-09-15T00:00:00.000Z',
  },
];

const UNSET_PREFERENCES: AIPreferences = {
  preferredModel: null,
  preferredIntent: null,
  primaryProvider: null,
  ghostTextEnabled: true,
};

const FREE_QUOTA: AiQuota = {
  tier: 'free',
  messages: { used: 3, limit: 30, resetsAt: RESETS_AT },
};
const BYOK_QUOTA: AiQuota = { tier: 'byok', messages: null };

test('a guest sees the Balanced label and no model menu', async ({
  browser,
}) => {
  const visitor = await browser.newContext({
    baseURL: E2E.frontend,
    locale: 'en-US',
  });
  const page = await visitor.newPage();

  try {
    await page.goto(DASHBOARD_PATH);
    const composer = await openCopilotDock(page);

    await expect(composer).toBeVisible();
    await expect(page.getByText(BALANCED_RE)).toBeVisible();
    await expect(page.getByRole('button', { name: PICKER_RE })).toHaveCount(0);
  } finally {
    await visitor.close();
  }
});

test('a free account picks an intent, is offered more models with its own key, and reads its plan', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Picker gratis');
  await routeApiJson(owner.page, MODELS_ROUTE_RE, () => FREE_CATALOG);
  await routeApiJson(owner.page, QUOTA_ROUTE_RE, () => FREE_QUOTA);
  await routeApiJson(owner.page, PREFERENCES_ROUTE_RE, () => UNSET_PREFERENCES);

  await owner.page.goto(`/notes/${note.id}`);
  await openCopilotDock(owner.page);
  const picker = owner.page.getByRole('button', { name: PICKER_RE });
  await expect(picker).toHaveText(BALANCED_RE);
  await picker.click();

  const menu = owner.page.getByRole('menu');
  await expect(menu.getByRole('menuitemradio')).toHaveCount(3);
  await expect(
    menu.getByRole('menuitemradio', { name: FAST_ROW_RE })
  ).toContainText('MiniMax M2.5');
  await expect(
    menu.getByRole('menuitemradio', { name: BALANCED_ROW_RE })
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    menu.getByRole('menuitemradio', { name: DEEP_ROW_RE })
  ).toContainText('Kimi K2.5');
  await expect(menu.getByRole('menuitem', { name: ADVANCED_RE })).toHaveCount(
    0
  );

  await menu.getByRole('menuitem', { name: BYOK_ENTRY_RE }).click();

  const settings = owner.page.getByRole('dialog', { name: SETTINGS_RE });
  await expect(
    settings.getByRole('heading', { name: API_KEYS_RE })
  ).toBeVisible();

  await settings.getByRole('button', { name: PLAN_RE }).click();
  await expect(settings.getByRole('listitem')).toHaveCount(3);
  const current = settings.locator('li[aria-current="true"]');
  await expect(current).toHaveCount(1);
  await expect(current.getByRole('heading')).toHaveText(FREE_NAME_RE);
  await expect(current.getByText(YOUR_PLAN_RE)).toBeVisible();
  await expect(current).toContainText(/(free|gratis) · 3\/30/i);
  await expect(settings.getByText(PLATFORM_PAYS_RE)).toHaveCount(2);
  await expect(settings.getByText(KEY_PAYS_RE)).toHaveCount(1);
});

test('a byok account reads its own models by provider and picks its primary provider', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Picker con keys');
  let preferences: AIPreferences = UNSET_PREFERENCES;
  const writes: unknown[] = [];
  await routeApiJson(owner.page, MODELS_ROUTE_RE, () => BYOK_CATALOG);
  await routeApiJson(owner.page, QUOTA_ROUTE_RE, () => BYOK_QUOTA);
  await routeApiJson(owner.page, KEYS_ROUTE_RE, () => KEYS);
  await routeApiJson(owner.page, PREFERENCES_ROUTE_RE, (request) => {
    if (request.method() === 'PUT') {
      const patch = request.postDataJSON() as Partial<AIPreferences>;
      writes.push(patch);
      preferences = { ...preferences, ...patch };
    }
    return preferences;
  });

  await owner.page.goto(`/notes/${note.id}`);
  await openCopilotDock(owner.page);
  await owner.page.getByRole('button', { name: PICKER_RE }).click();

  await expect(
    owner.page.getByRole('menuitem', { name: BYOK_ENTRY_RE })
  ).toHaveCount(0);
  await owner.page.getByRole('menuitem', { name: ADVANCED_RE }).focus();
  await owner.page.keyboard.press('ArrowRight');
  const advanced = owner.page.getByRole('menu', { name: ADVANCED_RE });
  await expect(advanced.getByText(/^(Anthropic|OpenRouter)$/)).toHaveText([
    'Anthropic',
    'OpenRouter',
  ]);
  await expect(
    advanced.getByRole('menuitemradio', { name: /Haiku 4\.5/ })
  ).toHaveCount(1);
  await expect(
    advanced.getByRole('menuitemradio', { name: /GPT-5\.6 Terra/ })
  ).toBeVisible();
  await owner.page.keyboard.press('Escape');

  await owner.page.getByRole('button', { name: ACCOUNT_RE }).click();
  await owner.page.getByRole('menuitem', { name: SETTINGS_RE }).click();
  const settings = owner.page.getByRole('dialog', { name: SETTINGS_RE });
  await settings.getByRole('button', { name: AI_SECTION_RE }).click();

  const primary = settings.getByRole('radiogroup', {
    name: PRIMARY_PROVIDER_RE,
  });
  await expect(primary.getByRole('radio')).toHaveCount(2);
  await expect(
    primary.getByRole('radio', { name: /^OpenRouter/ })
  ).toHaveAttribute('aria-checked', 'true');
  await primary.getByRole('radio', { name: /^Anthropic/ }).click();
  await expect.poll(() => writes).toEqual([{ primaryProvider: 'anthropic' }]);
  await expect(
    primary.getByRole('radio', { name: /^Anthropic/ })
  ).toHaveAttribute('aria-checked', 'true');

  await settings.getByRole('button', { name: PLAN_RE }).click();
  const current = settings.locator('li[aria-current="true"]');
  await expect(current.getByRole('heading')).toHaveText(KEY_NAME_RE);
  await expect(current).toContainText(/(your key|tu key) · Anthropic/i);
});

test('a reply that fell back says which model answered', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Respuesta con fallback');
  await routeApiJson(owner.page, MODELS_ROUTE_RE, () => FREE_CATALOG);
  await routeApiJson(owner.page, QUOTA_ROUTE_RE, () => FREE_QUOTA);
  await routeApiJson(owner.page, PREFERENCES_ROUTE_RE, () => UNSET_PREFERENCES);
  const agent = await scriptAgent(owner.page, { onMessage: [] });

  await owner.page.goto(`/notes/${note.id}`);
  const composer = await openCopilotDock(owner.page);
  await composer.fill('Resume esta nota');
  await owner.page.keyboard.press('Enter');
  const { turnId } = sentMessageSchema.parse(
    await agent.waitForSent('agent:message')
  );
  agent.emit('agent:chunk', { turnId, text: 'Resumen listo.' });
  agent.emit('agent:done', {
    usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
    sources: [],
    knownNotes: [],
    webSources: [],
    stopReason: 'completed',
    turnId,
    modelResolution: {
      requested: 'anthropic:claude-haiku-4-5',
      resolved: 'openrouter:deepseek/deepseek-v3.2',
      fallback: {
        reason: 'not_in_tier',
        from: 'anthropic:claude-haiku-4-5',
        to: 'openrouter:deepseek/deepseek-v3.2',
      },
    },
  });

  await expect(owner.page.getByText('Resumen listo.')).toBeVisible();
  await expect(owner.page.getByText(FALLBACK_NOTICE_RE)).toBeVisible();
});
