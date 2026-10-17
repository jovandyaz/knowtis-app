import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

const VERCEL_CONFIG_PATH = resolve(import.meta.dirname, '../../../vercel.json');
const ALL_ROUTES_SOURCE = '/(.*)';
const REPORT_ONLY_CSP_HEADER = 'Content-Security-Policy-Report-Only';
const ENFORCED_CSP_HEADER = 'Content-Security-Policy';
const API_HOST = 'api.knowtis.app';
const CSP_REPORT_URL = `https://${API_HOST}/api/v1/csp-reports`;
const CSP_REPORT_GROUP = 'csp';

const IMG_SRC_DIRECTIVE: [string, string[]] = [
  'img-src',
  ["'self'", 'data:', 'blob:', `https://${STORED_IMAGE_HOST}`],
];

const UPGRADE_INSECURE_REQUESTS_DIRECTIVE: [string, string[]] = [
  'upgrade-insecure-requests',
  [],
];

const EXPECTED_REPORT_ONLY_CSP_DIRECTIVES: [string, string[]][] = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  IMG_SRC_DIRECTIVE,
  ['font-src', ["'self'", 'data:']],
  ['connect-src', ["'self'", `https://${API_HOST}`, `wss://${API_HOST}`]],
  ['frame-src', ["'none'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'none'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'self'"]],
  ['report-uri', [CSP_REPORT_URL]],
  ['report-to', [CSP_REPORT_GROUP]],
];

interface VercelRewrite {
  source: string;
  destination: string;
  has?: { type: string; key: string; value?: { inc?: string[] } | string }[];
}

const FETCH_DEST_HEADER = 'sec-fetch-dest';
const ALLOWED_PROXY_FETCH_DESTS = ['script', 'empty'];
const ABSOLUTE_HTTP_URL = /^https?:\/\//i;

interface VercelConfig {
  rewrites?: VercelRewrite[];
  headers?: VercelHeaderRule[];
}

function vercelConfig(): VercelConfig {
  return JSON.parse(readFileSync(VERCEL_CONFIG_PATH, 'utf8')) as VercelConfig;
}

function rewrites(): VercelRewrite[] {
  return vercelConfig().rewrites ?? [];
}

function headerRules(): VercelHeaderRule[] | undefined {
  return vercelConfig().headers;
}

function cspDirectives(header: string): [string, string[]][] {
  const csp = headerRules()
    ?.find(({ source }) => source === ALL_ROUTES_SOURCE)
    ?.headers.find(({ key }) => key === header)?.value;
  return (csp ?? '')
    .split(';')
    .map((directive) => directive.trim().split(/\s+/))
    .filter(([name]) => name !== '')
    .map(([name, ...sources]) => [name, sources]);
}

describe('notes security headers (vercel.json)', () => {
  it('sends exactly these headers, on every route, from a single rule', () => {
    expect(headerRules()).toEqual([
      {
        source: ALL_ROUTES_SOURCE,
        headers: [
          { key: ENFORCED_CSP_HEADER, value: expect.any(String) },
          { key: REPORT_ONLY_CSP_HEADER, value: expect.any(String) },
          {
            key: 'Reporting-Endpoints',
            value: `${CSP_REPORT_GROUP}="${CSP_REPORT_URL}"`,
          },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(self)',
          },
        ],
      },
    ]);
  });

  it('declares every report-only CSP directive once, with exactly these sources', () => {
    expect(cspDirectives(REPORT_ONLY_CSP_HEADER)).toEqual(
      EXPECTED_REPORT_ONLY_CSP_DIRECTIVES
    );
  });

  it('enforces img-src, with the sources the report-only policy lists, and upgrade-insecure-requests, which a report-only policy ignores', () => {
    expect(cspDirectives(ENFORCED_CSP_HEADER)).toEqual([
      IMG_SRC_DIRECTIVE,
      UPGRADE_INSECURE_REQUESTS_DIRECTIVE,
    ]);
  });

  it('forwards off-origin proxy rewrites only for script and empty fetch destinations', () => {
    const proxies = rewrites().filter(({ destination }) =>
      ABSOLUTE_HTTP_URL.test(destination)
    );
    expect(proxies).toHaveLength(2);
    for (const { source, has } of proxies) {
      const condition = has?.find(
        ({ type, key }) => type === 'header' && key === FETCH_DEST_HEADER
      );
      const allowed =
        typeof condition?.value === 'object' ? condition.value.inc : undefined;
      expect(allowed, source).toEqual(ALLOWED_PROXY_FETCH_DESTS);
    }
  });
});
