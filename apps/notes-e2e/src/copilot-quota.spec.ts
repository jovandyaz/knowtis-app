import { expect, type Page } from '@playwright/test';
import { z } from 'zod';

import {
  AI_BYOK_KEY_FAILED_CODE,
  AI_QUOTA_EXHAUSTED_CODE,
  type AgentByokKeyFailedError,
  type AgentQuotaExhaustedError,
  type AgentQuotaPayload,
  type AiQuota,
} from '@knowtis/shared-types';

import { E2E } from '../support/environment';
import {
  expandCopilotDock,
  openCopilotDock,
  routeApiJson,
  scriptAgent,
  test,
  type ScriptedAgent,
} from './fixtures/copilot.fixture';

const QUOTA_ROUTE_RE = /\/ai\/quota(?:\?|$)/;
const DASHBOARD_PATH = '/dashboard';
const DAY_MS = 24 * 60 * 60 * 1000;
const RESETS_AT = new Date(
  Math.ceil(Date.now() / DAY_MS) * DAY_MS
).toISOString();
const NEXT_RESETS_AT = new Date(Date.parse(RESETS_AT) + DAY_MS).toISOString();

const TIER_LABEL_PATTERN = {
  anonymous: 'Guest|Invitado',
  free: 'Free|Gratis',
} as const;
type MeteredTier = keyof typeof TIER_LABEL_PATTERN;

const ONE_LEFT_RE = /^(1 message left today|te queda 1 mensaje hoy)$/i;
const GUEST_SPENT_RE =
  /^(you used your 5 messages for today|usaste tus 5 mensajes de hoy)/i;
const FREE_SPENT_RE =
  /^(you used your 30 messages for today|usaste tus 30 mensajes de hoy)/i;
const REGISTER_RE = /^(create a free account|crear cuenta gratis)$/i;
const BYOK_RE = /^(use your own api key|usar tu propia api key)$/i;
const REVIEW_KEY_RE = /^(check your key|revisar tu key)$/i;
const CREDIT_RE = /out of credits|sin créditos/i;
const RETRY_RE = /^(retry|reintentar)$/i;
const THREAD_RE = /^(conversation|conversación)$/i;
const SETTINGS_RE = /^(settings|configuración)$/i;
const API_KEYS_RE = /^(your api keys|tus claves de api)$/i;
const REGISTER_URL_RE = /\/register$/;

const DONE = {
  usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
  sources: [],
  knownNotes: [],
  webSources: [],
  stopReason: 'completed',
};

const sentMessageSchema = z.object({ turnId: z.string().min(1) });

function metered(
  tier: MeteredTier,
  used: number,
  limit: number,
  resetsAt = RESETS_AT
): AiQuota {
  return { tier, messages: { used, limit, resetsAt } };
}

function tierBadge(page: Page, tier: MeteredTier) {
  return page.getByRole('img', {
    name: new RegExp(`^(${TIER_LABEL_PATTERN[tier]}):`, 'i'),
  });
}

function badgeText(tier: MeteredTier, used: number, limit: number): RegExp {
  return new RegExp(`^(${TIER_LABEL_PATTERN[tier]}) · ${used}/${limit}$`);
}

async function routeQuota(page: Page, initial: AiQuota) {
  let quota = initial;
  await routeApiJson(page, QUOTA_ROUTE_RE, () => quota);
  return {
    answer(next: AiQuota) {
      quota = next;
    },
  };
}

async function sentTurnId(agent: ScriptedAgent): Promise<string> {
  return sentMessageSchema.parse(await agent.waitForSent('agent:message'))
    .turnId;
}

test('a guest who spends the last message of the day is offered an account', async ({
  browser,
}) => {
  const answer = 'Hoy escribiste dos notas.';
  const visitor = await browser.newContext({
    baseURL: E2E.frontend,
    locale: 'en-US',
  });
  const page = await visitor.newPage();

  try {
    const quota = await routeQuota(page, metered('anonymous', 4, 5));
    const agent = await scriptAgent(page, { onMessage: [] });
    await page.goto(DASHBOARD_PATH);
    const composer = await openCopilotDock(page);
    const badge = tierBadge(page, 'anonymous');
    await expect(badge).toHaveText(badgeText('anonymous', 4, 5));
    await expect(page.getByText(ONE_LEFT_RE)).toHaveClass(/text-warning/);

    await composer.fill('Resume mis notas de hoy');
    await page.keyboard.press('Enter');
    const turnId = await sentTurnId(agent);
    agent.emit('agent:quota', {
      turnId,
      ...metered('anonymous', 5, 5),
    } satisfies AgentQuotaPayload);
    agent.emit('agent:chunk', { turnId, text: answer });

    await expect(page.getByText(answer)).toBeVisible();
    await expect(badge).toHaveText(badgeText('anonymous', 5, 5));
    await expect(composer).toBeVisible();

    quota.answer(metered('anonymous', 5, 5));
    agent.emit('agent:done', { ...DONE, turnId });

    const register = page.getByRole('button', { name: REGISTER_RE });
    await expect(register).toBeVisible();
    await expect(page.getByText(GUEST_SPENT_RE)).toBeVisible();
    await expect(composer).toHaveCount(0);
    await expect(badge).toHaveText(badgeText('anonymous', 5, 5));

    await register.click();

    await expect(page).toHaveURL(REGISTER_URL_RE);
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await visitor.close();
  }
});

test('a free account that starts the day spent opens Settings on its API keys', async ({
  sharing,
}) => {
  const { owner } = sharing;
  await routeQuota(owner.page, metered('free', 30, 30));

  await owner.page.goto(DASHBOARD_PATH);
  const composer = await expandCopilotDock(owner.page);

  await expect(tierBadge(owner.page, 'free')).toHaveText(
    badgeText('free', 30, 30)
  );
  await expect(owner.page.getByText(FREE_SPENT_RE)).toBeVisible();
  await expect(composer).toHaveCount(0);

  await owner.page.getByRole('button', { name: BYOK_RE }).click();

  const settings = owner.page.getByRole('dialog', { name: SETTINGS_RE });
  await expect(settings).toBeVisible();
  await expect(
    settings.getByRole('heading', { name: API_KEYS_RE })
  ).toBeVisible();
});

test('a message refused for the quota returns to the composer without a retry', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const question = 'Resume esta nota en tres puntos';
  const note = await owner.createNote('Cuota agotada');
  const quota = await routeQuota(owner.page, metered('free', 29, 30));
  const agent = await scriptAgent(owner.page, { onMessage: [] });

  await owner.page.goto(`/notes/${note.id}`);
  const composer = await openCopilotDock(owner.page);
  await composer.fill(question);
  await owner.page.keyboard.press('Enter');
  const turnId = await sentTurnId(agent);
  const sentBubble = owner.page
    .getByRole('log', { name: THREAD_RE })
    .getByText(question, { exact: true });
  await expect(sentBubble).toBeVisible();

  quota.answer(metered('free', 30, 30));
  agent.emit('agent:error', {
    code: AI_QUOTA_EXHAUSTED_CODE,
    message: 'Daily message quota exhausted',
    turnId,
    resetsAt: RESETS_AT,
    upgrade: 'byok',
  } satisfies AgentQuotaExhaustedError);

  const useOwnKey = owner.page.getByRole('button', { name: BYOK_RE });
  await expect(useOwnKey).toBeVisible();
  await expect(sentBubble).toHaveCount(0);
  await expect(composer).toHaveCount(0);

  quota.answer(metered('free', 0, 30, NEXT_RESETS_AT));
  agent.emit('agent:quota', {
    turnId,
    ...metered('free', 0, 30, NEXT_RESETS_AT),
  } satisfies AgentQuotaPayload);

  await expect(composer).toHaveValue(question);
  await expect(useOwnKey).toHaveCount(0);
  await expect(sentBubble).toHaveCount(0);
  await expect(owner.page.getByRole('button', { name: RETRY_RE })).toHaveCount(
    0
  );
});

test('a key the provider refuses for credit is sent to Settings, not retried', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Key sin crédito');
  await routeQuota(owner.page, { tier: 'byok', messages: null });
  const agent = await scriptAgent(owner.page, { onMessage: [] });

  await owner.page.goto(`/notes/${note.id}`);
  const composer = await openCopilotDock(owner.page);
  await composer.fill('Resume esta nota');
  await owner.page.keyboard.press('Enter');
  const turnId = await sentTurnId(agent);
  agent.emit('agent:error', {
    code: AI_BYOK_KEY_FAILED_CODE,
    message: 'The provider refused the key',
    turnId,
    provider: 'anthropic',
    kind: 'credit',
  } satisfies AgentByokKeyFailedError);

  const banner = owner.page.getByRole('alert').filter({ hasText: CREDIT_RE });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: RETRY_RE })).toHaveCount(0);

  await banner.getByRole('button', { name: REVIEW_KEY_RE }).click();

  const settings = owner.page.getByRole('dialog', { name: SETTINGS_RE });
  await expect(settings).toBeVisible();
  await expect(
    settings.getByRole('heading', { name: API_KEYS_RE })
  ).toBeVisible();
});
