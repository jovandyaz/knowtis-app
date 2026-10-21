import { expect, type Page, type Request } from '@playwright/test';

import { COPILOT_CONVERSATION_STORAGE_KEY } from '@knowtis/shared-util';

import {
  corsHeaders,
  releaseScriptedSockets,
  scriptSocket,
  type ScriptedSocket,
} from './scripted-socket.fixture';
import { test as sharingTest } from './sharing.fixture';

const AGENT_NAMESPACE = '/agent';
const COMPOSER_RE = /copilot|pregunta|ask/i;
const DOCK_TOGGLE_RE = /^copilot$/i;
const DOCK_HYDRATION_TIMEOUT_MS = 1_000;
const DOCK_EXPAND_TIMEOUT_MS = 10_000;
// Same origin as the app, so its localStorage is reachable without booting it.
const STATIC_PAGE_PATH = '/apple-touch-icon.png';

export interface AgentScript {
  /** Emitted in order once the client sends `agent:message`. */
  onMessage: readonly [event: string, payload: unknown][];
  /** Emitted in order once the client sends `agent:approve`. */
  onApprove?: readonly [event: string, payload: unknown][];
  /** Emitted in order once the client sends `agent:reject`. */
  onReject?: readonly [event: string, payload: unknown][];
}

const JSON_CONTENT_TYPE = 'application/json';
const ROUTED_API_HEADERS = 'accept-language, authorization, content-type';
const ROUTED_API_METHODS = 'GET, PUT, OPTIONS';
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;

/** Answers an API endpoint from the test, its CORS preflight included; `answer` sees each request and returns the JSON body. */
export async function routeApiJson(
  page: Page,
  url: RegExp,
  answer: (request: Request) => unknown
): Promise<void> {
  await page.route(url, (route) => {
    const request = route.request();
    const headers = {
      ...corsHeaders(request, JSON_CONTENT_TYPE),
      'access-control-allow-headers': ROUTED_API_HEADERS,
      'access-control-allow-methods': ROUTED_API_METHODS,
    };
    return request.method() === 'OPTIONS'
      ? route.fulfill({ status: HTTP_NO_CONTENT, headers })
      : route.fulfill({
          status: HTTP_OK,
          headers,
          body: JSON.stringify(answer(request)),
        });
  });
}

export function scriptAgent(
  page: Page,
  script: AgentScript
): Promise<ScriptedSocket> {
  return scriptSocket(page, AGENT_NAMESPACE, {
    'agent:message': script.onMessage,
    'agent:approve': script.onApprove,
    'agent:reject': script.onReject,
  });
}

// The owner page outlives the test, and a store still running would write the
// thread back, so the app is left before the key is removed.
async function forgetCopilotConversation(page: Page): Promise<void> {
  const response = await page.goto(STATIC_PAGE_PATH);
  expect(response?.ok()).toBe(true);
  await page.evaluate(
    (key) => localStorage.removeItem(key),
    COPILOT_CONVERSATION_STORAGE_KEY
  );
}

/**
 * Test-scoped, not worker-scoped: a worker-scoped fixture here would give this
 * file its own worker "shape", so Playwright would restart the worker and
 * rebuild the whole `sharing` cast just for these specs.
 */
export const test = sharingTest.extend<{ scriptedAgents: true }, object>({
  scriptedAgents: [
    async ({ sharing }, use) => {
      try {
        await use(true);
      } finally {
        await releaseScriptedSockets();
        await sharing.owner.page.unrouteAll({ behavior: 'ignoreErrors' });
        await forgetCopilotConversation(sharing.owner.page);
      }
    },
    { auto: true },
  ],
});

function copilotComposer(page: Page) {
  return page.getByRole('textbox', { name: COMPOSER_RE }).first();
}

/** The dock's open state persists across notes in the same worker, so right
 * after navigation the composer may just not have hydrated yet — an
 * `isVisible()` snapshot can't tell that from "closed" and toggling a dock
 * that is actually open closes it. Waiting bounds the hydration race instead. */
export async function openCopilotDock(page: Page) {
  const composer = copilotComposer(page);
  const alreadyOpen = await composer
    .waitFor({ state: 'visible', timeout: DOCK_HYDRATION_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!alreadyOpen) {
    await page.getByRole('button', { name: DOCK_TOGGLE_RE }).first().click();
  }
  return composer;
}

export async function expandCopilotDock(page: Page) {
  const toggle = page.getByRole('button', { name: DOCK_TOGGLE_RE }).first();
  await expect(toggle).toBeVisible();
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', {
      timeout: DOCK_HYDRATION_TIMEOUT_MS,
    });
  }).toPass({ timeout: DOCK_EXPAND_TIMEOUT_MS });
  return copilotComposer(page);
}
