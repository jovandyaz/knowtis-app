import { expect } from 'vitest';

import type { WebSearchHit } from '@knowtis/ai-gateway';

import type { CanaryHost } from './canary-host';

export const TAVILY_HOST = 'api.tavily.com';
const TAVILY_SEARCH_PATH = '/search';
const TAVILY_EXTRACT_PATH = '/extract';
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set([
  '127.0.0.1',
  'localhost',
  '[::1]',
]);
const NOT_FOUND = 404;
const FAILED_REQUEST_MESSAGE = 'fetch failed';
const GENERIC_PAGE = 'A plain article about planning.';

export interface EgressRequest {
  readonly url: string;
  readonly host: string;
  /** The body as JSON when it parses, else as sent. */
  readonly body: unknown;
  /** No fixture or loopback server serves the host, so it was answered as a network failure. */
  readonly refused: boolean;
}

export interface TavilyFixtures {
  /** The hits `/search` answers for a query; none unless given. */
  readonly search?: (query: string) => readonly WebSearchHit[];
  /** The page text `/extract` answers for a URL; a generic page unless given. */
  readonly extract?: (url: string) => string;
}

export interface EgressRecorder {
  readonly requests: readonly EgressRequest[];
  /** Each requested host once, in the order first seen. */
  hosts(): string[];
  /** Every URL a Tavily `/extract` body asked for, in order. */
  extractUrls(): string[];
  /** Every query a Tavily `/search` body carried, in order. */
  searchQueries(): string[];
  restore(): void;
}

function urlOf(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : String(input));
}

function bodyOf(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') {
    return init?.body ?? null;
  }
  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fieldOf(body: unknown, key: string): unknown {
  return isRecord(body) ? body[key] : undefined;
}

function stringsIn(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function tavilyResponse(
  url: URL,
  body: unknown,
  fixtures: TavilyFixtures
): Response {
  if (url.pathname === TAVILY_SEARCH_PATH) {
    const query = String(fieldOf(body, 'query') ?? '');
    return Response.json({ results: fixtures.search?.(query) ?? [] });
  }
  if (url.pathname === TAVILY_EXTRACT_PATH) {
    return Response.json({
      results: stringsIn(fieldOf(body, 'urls')).map((target) => ({
        url: target,
        raw_content: fixtures.extract?.(target) ?? GENERIC_PAGE,
      })),
    });
  }
  return new Response(null, { status: NOT_FOUND });
}

/**
 * Replaces the global `fetch` until `restore()` and records every request. Tavily is answered from `tavily`, the
 * canary's public-looking host is forwarded to its loopback server so it records the hit, other
 * loopback requests reach the real `fetch`, and anything else is recorded as refused and fails
 * the way an unreachable host does.
 */
export function installEgressRecorder(
  options: {
    readonly tavily?: TavilyFixtures;
    readonly canary?: CanaryHost;
  } = {}
): EgressRecorder {
  const realFetch = globalThis.fetch;
  const requests: EgressRequest[] = [];
  const recordingFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = urlOf(input);
    const body = bodyOf(init);
    const served =
      url.hostname === TAVILY_HOST ||
      url.hostname === options.canary?.hostname ||
      LOOPBACK_HOSTNAMES.has(url.hostname);
    requests.push({
      url: url.href,
      host: url.hostname,
      body,
      refused: !served,
    });
    if (url.hostname === TAVILY_HOST) {
      return tavilyResponse(url, body, options.tavily ?? {});
    }
    if (options.canary && url.hostname === options.canary.hostname) {
      return realFetch(options.canary.loopbackUrl(url.pathname + url.search), {
        method: init?.method ?? 'GET',
      });
    }
    if (served) {
      return realFetch(input, init);
    }
    throw new TypeError(FAILED_REQUEST_MESSAGE);
  };
  globalThis.fetch = recordingFetch;
  const tavilyBodies = (path: string) =>
    requests
      .filter(
        (request) =>
          request.host === TAVILY_HOST && new URL(request.url).pathname === path
      )
      .map((request) => request.body);
  return {
    requests,
    hosts: () => [...new Set(requests.map((request) => request.host))],
    extractUrls: () =>
      tavilyBodies(TAVILY_EXTRACT_PATH).flatMap((body) =>
        stringsIn(fieldOf(body, 'urls'))
      ),
    searchQueries: () =>
      tavilyBodies(TAVILY_SEARCH_PATH).map((body) =>
        String(fieldOf(body, 'query') ?? '')
      ),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

/** Fails unless every recorded request went to Tavily and the canary received none. */
export function expectNoEgressBeyondTavily(
  egress: EgressRecorder,
  canary: CanaryHost
): void {
  expect(canary.hits).toEqual([]);
  expect(egress.requests.filter((request) => request.refused)).toEqual([]);
  expect(egress.hosts().filter((host) => host !== TAVILY_HOST)).toEqual([]);
}
