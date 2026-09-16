import { randomUUID } from 'node:crypto';

import { expect, type Page, type Request, type Route } from '@playwright/test';

import { E2E } from '../../support/environment';

const SEPARATOR = '\x1e';
const HOLD_MS = 3_000;
const POLL_MS = 25;
const CONNECT_RE = /^40(\/[^,]*)?,?/;
const COMPOSER_RE = /copilot|pregunta|ask/i;
const DOCK_TOGGLE_RE = /^copilot$/i;
const DOCK_HYDRATION_TIMEOUT_MS = 1_000;

export interface AgentScript {
  /** Emitted in order once the client sends `agent:message`. */
  onMessage: readonly [event: string, payload: unknown][];
  /** Emitted in order once the client sends `agent:approve`. */
  onApprove?: readonly [event: string, payload: unknown][];
  /** Emitted in order once the client sends `agent:reject`. */
  onReject?: readonly [event: string, payload: unknown][];
}

export interface ScriptedAgent {
  /** Every client→server socket.io event seen so far, in order. */
  readonly sent: readonly { event: string; payload: unknown }[];
  waitForSent(event: string): Promise<unknown>;
  /** Pushes one server→client event, for turns the static script cannot end on its own. */
  emit(event: string, payload: unknown): void;
}

function handshake(sid: string): string {
  return `0${JSON.stringify({
    sid,
    upgrades: [],
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxPayload: 1_000_000,
  })}`;
}

/** `42/agent,["event",payload]` — socket.io v4 EVENT on the /agent namespace. */
function event(name: string, payload: unknown): string {
  return `42/agent,${JSON.stringify([name, payload])}`;
}

/** socket.io opens on HTTP polling; answering the handshake with `upgrades: []` keeps
 * it there, since polling is the only transport `page.route` can intercept. */
export async function scriptAgent(
  page: Page,
  script: AgentScript
): Promise<ScriptedAgent> {
  const sid = randomUUID().replaceAll('-', '').slice(0, 20);
  const outbox: string[] = [];
  const sent: { event: string; payload: unknown }[] = [];

  const replies: Record<string, readonly [string, unknown][] | undefined> = {
    'agent:message': script.onMessage,
    'agent:approve': script.onApprove,
    'agent:reject': script.onReject,
  };

  function receive(packet: string): void {
    if (!packet.startsWith('42/agent,')) {
      return;
    }
    const [name, payload] = JSON.parse(packet.slice('42/agent,'.length)) as [
      string,
      unknown,
    ];
    sent.push({ event: name, payload });
    for (const [replyName, replyPayload] of replies[name] ?? []) {
      outbox.push(event(replyName, replyPayload));
    }
  }

  /** A held drain() can still be in flight when the test tears down the page;
   * fulfilling a route on a closed page throws and would otherwise crash the
   * worker. */
  async function safeFulfill(
    route: Route,
    options: Parameters<Route['fulfill']>[0]
  ): Promise<void> {
    await route.fulfill(options).catch(() => undefined);
  }

  /** The frontend origin differs from the API's, and the client sets
   * withCredentials, so a fulfilled response needs the request's own Origin
   * echoed back (never `*`) plus Allow-Credentials, or Chromium drops it. */
  function corsHeaders(request: Request): Record<string, string> {
    const origin = request.headers()['origin'] ?? E2E.frontend;
    return {
      'content-type': 'text/plain; charset=UTF-8',
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
    };
  }

  async function drain(route: Route): Promise<void> {
    const deadline = Date.now() + HOLD_MS;
    while (outbox.length === 0 && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, POLL_MS));
    }
    // A NOOP never resets engine.io-client's ping watchdog; a real PING must
    // eventually go out or the socket self-closes after pingInterval+pingTimeout.
    const body = outbox.length > 0 ? outbox.splice(0).join(SEPARATOR) : '2';
    await safeFulfill(route, {
      status: 200,
      headers: corsHeaders(route.request()),
      body,
    });
  }

  await page.route(/\/socket\.io\/\?.*EIO=4/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'POST') {
      for (const packet of (request.postData() ?? '').split(SEPARATOR)) {
        const connectMatch = packet.match(CONNECT_RE);
        if (connectMatch) {
          const namespace = connectMatch[1] ?? '';
          outbox.push(`40${namespace},${JSON.stringify({ sid })}`);
        } else {
          receive(packet);
        }
      }
      await safeFulfill(route, {
        status: 200,
        headers: corsHeaders(request),
        body: 'ok',
      });
      return;
    }

    if (!url.searchParams.get('sid')) {
      await safeFulfill(route, {
        status: 200,
        headers: corsHeaders(request),
        body: handshake(sid),
      });
      return;
    }

    await drain(route);
  });

  return {
    sent,
    async waitForSent(name: string) {
      await expect
        .poll(() => sent.some((item) => item.event === name), {
          timeout: 15_000,
        })
        .toBe(true);
      return sent.findLast((item) => item.event === name)?.payload;
    },
    emit(name, payload) {
      outbox.push(event(name, payload));
    },
  };
}

/** The dock's open state persists across notes in the same worker, so right
 * after navigation the composer may just not have hydrated yet — an
 * `isVisible()` snapshot can't tell that from "closed" and toggling a dock
 * that is actually open closes it. Waiting bounds the hydration race instead. */
export async function openCopilotDock(page: Page) {
  const composer = page.getByRole('textbox', { name: COMPOSER_RE }).first();
  const alreadyOpen = await composer
    .waitFor({ state: 'visible', timeout: DOCK_HYDRATION_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!alreadyOpen) {
    await page.getByRole('button', { name: DOCK_TOGGLE_RE }).first().click();
  }
  return composer;
}
