import { randomUUID } from 'node:crypto';

import { expect, type Page, type Route } from '@playwright/test';
import postgres from 'postgres';

import { E2E } from '../../support/environment';
import { test as sharingTest } from './sharing.fixture';

const SEPARATOR = '\x1e';
const HOLD_MS = 20_000;
const POLL_MS = 25;

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

  async function drain(route: Route): Promise<void> {
    const deadline = Date.now() + HOLD_MS;
    while (outbox.length === 0 && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, POLL_MS));
    }
    const body = outbox.length > 0 ? outbox.splice(0).join(SEPARATOR) : '6';
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=UTF-8',
      body,
    });
  }

  await page.route(/\/socket\.io\/\?.*EIO=4/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'POST') {
      for (const packet of (request.postData() ?? '').split(SEPARATOR)) {
        if (packet.startsWith('40/agent')) {
          outbox.push(`40/agent,${JSON.stringify({ sid })}`);
        } else {
          receive(packet);
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=UTF-8',
        body: 'ok',
      });
      return;
    }

    if (!url.searchParams.get('sid')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=UTF-8',
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
  };
}

export const test = sharingTest.extend<object, { ai: true }>({
  ai: [
    async (_fixtures, use) => {
      const db = postgres(E2E.database, { max: 1 });
      try {
        const updated =
          await db`update feature_flags set enabled = true where key = 'ai_enabled'`;
        if (updated.count === 0) {
          await db`insert into feature_flags (key, enabled) values ('ai_enabled', true)
            on conflict (key) do update set enabled = true`;
        }
        await use(true);
      } finally {
        await db.end({ timeout: 5 });
      }
    },
    { scope: 'worker', auto: true },
  ],
});

export { expect } from '@playwright/test';
