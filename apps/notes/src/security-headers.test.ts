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
const CSP_HEADER = 'Content-Security-Policy-Report-Only';
const API_HOST = 'api.knowtis.app';
const CSP_REPORT_URL = `https://${API_HOST}/api/v1/csp-reports`;
const CSP_REPORT_GROUP = 'csp';

const EXPECTED_CSP_DIRECTIVES: [string, string[]][] = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:', `https://${STORED_IMAGE_HOST}`]],
  ['font-src', ["'self'", 'data:']],
  ['connect-src', ["'self'", `https://${API_HOST}`, `wss://${API_HOST}`]],
  ['frame-src', ["'none'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'none'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'self'"]],
  ['upgrade-insecure-requests', []],
  ['report-uri', [CSP_REPORT_URL]],
  ['report-to', [CSP_REPORT_GROUP]],
];

function headerRules(): VercelHeaderRule[] | undefined {
  const config = JSON.parse(readFileSync(VERCEL_CONFIG_PATH, 'utf8')) as {
    headers?: VercelHeaderRule[];
  };
  return config.headers;
}

function cspDirectives(): [string, string[]][] {
  const csp = headerRules()
    ?.find(({ source }) => source === ALL_ROUTES_SOURCE)
    ?.headers.find(({ key }) => key === CSP_HEADER)?.value;
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
          { key: CSP_HEADER, value: expect.any(String) },
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

  it('declares every CSP directive once, with exactly these sources', () => {
    expect(cspDirectives()).toEqual(EXPECTED_CSP_DIRECTIVES);
  });
});
