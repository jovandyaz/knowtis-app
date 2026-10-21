import { randomUUID } from 'node:crypto';

import { expect, type Page, type Request, type Route } from '@playwright/test';

import { E2E } from '../../support/environment';

const SEPARATOR = '\x1e';
const HOLD_MS = 3_000;
const POLL_MS = 25;
const CONNECT_RE = /^40(\/[^,]*)?,?/;
const UNKNOWN_SESSION = JSON.stringify({
  code: 1,
  message: 'Session ID unknown',
});
const POLLING_ROUTE_RE = /\/socket\.io\/\?.*EIO=4/;

/** Server→client events emitted in order once the client sends the keyed event. */
export type SocketReplies = Readonly<
  Record<
    string,
    readonly (readonly [event: string, payload: unknown])[] | undefined
  >
>;

export interface ScriptedSocket {
  /** Every client→server socket.io event seen so far, in order, with the
   * socket that sent it, numbered from 0 in the order the client opened them. */
  readonly sent: readonly { event: string; payload: unknown; socket: number }[];
  readonly closedSockets: readonly number[];
  waitForSent(event: string): Promise<unknown>;
  /** Pushes one server→client event on the newest socket, or on `socket`, for
   * turns the static script cannot end on its own. */
  emit(event: string, payload: unknown, socket?: number): void;
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

/** The frontend origin differs from the API's, and the client sets
 * withCredentials, so a fulfilled response needs the request's own Origin
 * echoed back (never `*`) plus Allow-Credentials, or Chromium drops it. */
export function corsHeaders(
  request: Request,
  contentType = 'text/plain; charset=UTF-8'
): Record<string, string> {
  const origin = request.headers()['origin'] ?? E2E.frontend;
  return {
    'content-type': contentType,
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
  };
}

/** Interception must not outlive the test that installed it: the `sharing` pages
 * are worker-scoped, so a handler left behind keeps answering every later socket
 * the page opens — including the editor's own — instead of the real server. */
const scriptedSocketReleases: (() => Promise<void>)[] = [];

/** Removes every socket script installed since the last release; call it when the test ends. */
export async function releaseScriptedSockets(): Promise<void> {
  const releases = scriptedSocketReleases.splice(0);
  await Promise.allSettled(releases.map((release) => release()));
}

/**
 * Answers the page's socket.io traffic on `namespace` from the test, replying
 * to each client event with the events `replies` lists for it.
 *
 * socket.io opens on HTTP polling; answering the handshake with `upgrades: []` keeps
 * it there, since polling is the only transport `page.route` can intercept.
 */
export async function scriptSocket(
  page: Page,
  namespace: string,
  replies: SocketReplies
): Promise<ScriptedSocket> {
  const closePacketRe = new RegExp(`^(41${namespace},?|1)$`);
  const eventPacketRe = new RegExp(`^42${namespace},(\\d+)?(\\[[\\s\\S]*\\])$`);
  const event = (name: string, payload: unknown) =>
    `42${namespace},${JSON.stringify([name, payload])}`;
  const sidPrefix = randomUUID().replaceAll('-', '').slice(0, 20);
  // A dropped socket leaves its long-poll pending until it is answered, so a
  // shared outbox would hand the live socket's packets to that orphaned poll.
  const outboxes: string[][] = [];
  const socketsBySid = new Map<string, number>();
  const sent: { event: string; payload: unknown; socket: number }[] = [];
  const closedSockets: number[] = [];
  const sleepers = new Set<() => void>();
  const heldPolls = new Set<Promise<void>>();
  let released = false;

  function openSocket(): string {
    const sid = `${sidPrefix}${outboxes.length}`;
    socketsBySid.set(sid, outboxes.length);
    outboxes.push([]);
    return sid;
  }

  function receive(packet: string, socket: number): void {
    if (closePacketRe.test(packet)) {
      if (!closedSockets.includes(socket)) {
        closedSockets.push(socket);
      }
      return;
    }
    const match = packet.match(eventPacketRe);
    if (!match) {
      return;
    }
    const [, ackId, body] = match;
    const [name, payload] = JSON.parse(body) as [string, unknown];
    sent.push({ event: name, payload, socket });
    const outbox = outboxes[socket];
    if (ackId !== undefined) {
      outbox.push(`43${namespace},${ackId}[]`);
    }
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

  /** Release has to wake a sleeping poll instead of waiting it out, or teardown
   * would block on an idle long-poll for the rest of its HOLD_MS. */
  function hold(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        sleepers.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      sleepers.add(wake);
    });
  }

  async function drain(route: Route, outbox: string[]): Promise<void> {
    const deadline = Date.now() + HOLD_MS;
    while (!released && outbox.length === 0 && Date.now() < deadline) {
      await hold(POLL_MS);
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

  async function intercept(route: Route): Promise<void> {
    const request = route.request();
    const sid = new URL(request.url()).searchParams.get('sid');

    if (!sid) {
      await safeFulfill(route, {
        status: 200,
        headers: corsHeaders(request),
        body: handshake(openSocket()),
      });
      return;
    }

    const socket = socketsBySid.get(sid);
    if (socket === undefined) {
      await safeFulfill(route, {
        status: 400,
        headers: corsHeaders(request),
        body: UNKNOWN_SESSION,
      });
      return;
    }

    if (request.method() === 'POST') {
      for (const packet of (request.postData() ?? '').split(SEPARATOR)) {
        const connectMatch = packet.match(CONNECT_RE);
        if (connectMatch) {
          const connectedNamespace = connectMatch[1] ?? '';
          outboxes[socket].push(
            `40${connectedNamespace},${JSON.stringify({ sid })}`
          );
        } else {
          receive(packet, socket);
        }
      }
      await safeFulfill(route, {
        status: 200,
        headers: corsHeaders(request),
        body: 'ok',
      });
      return;
    }

    const poll = drain(route, outboxes[socket]);
    heldPolls.add(poll);
    try {
      await poll;
    } finally {
      heldPolls.delete(poll);
    }
  }

  await page.route(POLLING_ROUTE_RE, intercept);

  scriptedSocketReleases.push(async () => {
    released = true;
    for (const wake of [...sleepers]) {
      wake();
    }
    await Promise.allSettled([...heldPolls]);
    await page.unroute(POLLING_ROUTE_RE, intercept).catch(() => undefined);
  });

  return {
    sent,
    closedSockets,
    async waitForSent(name: string) {
      await expect
        .poll(() => sent.some((item) => item.event === name), {
          timeout: 15_000,
        })
        .toBe(true);
      return sent.findLast((item) => item.event === name)?.payload;
    },
    emit(name, payload, socket = outboxes.length - 1) {
      outboxes[socket].push(event(name, payload));
    },
  };
}
