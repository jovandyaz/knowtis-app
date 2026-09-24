import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

const VERCEL_CONFIG_PATH = resolve(import.meta.dirname, '../vercel.json');
const INDEX_HTML_PATH = resolve(import.meta.dirname, '../index.html');
const BASE_ELEMENT = /<base[\s>]/i;
const ALL_ROUTES_SOURCE = '/(.*)';
const REPORT_ONLY_CSP_HEADER = 'Content-Security-Policy-Report-Only';
const ENFORCED_CSP_HEADER = 'Content-Security-Policy';
const API_HOST = 'api.knowtis.app';
const CSP_REPORT_URL = `https://${API_HOST}/api/v1/csp-reports`;
const CSP_REPORT_GROUP = 'csp';

const IMG_SRC_DIRECTIVE: [string, string[]] = [
  'img-src',
  ["'self'", 'data:', `https://${STORED_IMAGE_HOST}`],
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
  ['connect-src', ["'self'", `https://${API_HOST}`]],
  ['frame-src', ["'none'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'none'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
  ['report-uri', [CSP_REPORT_URL]],
  ['report-to', [CSP_REPORT_GROUP]],
];

function headerRules(): VercelHeaderRule[] | undefined {
  const config = JSON.parse(readFileSync(VERCEL_CONFIG_PATH, 'utf8')) as {
    headers?: VercelHeaderRule[];
  };
  return config.headers;
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

describe('backoffice security headers (apps/backoffice/vercel.json)', () => {
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
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=()',
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

  it('serves an index.html with no <base>, which base-uri none would report on every load', () => {
    expect(readFileSync(INDEX_HTML_PATH, 'utf8')).not.toMatch(BASE_ELEMENT);
  });

  it('enforces img-src, with the sources the report-only policy lists, and upgrade-insecure-requests', () => {
    expect(cspDirectives(ENFORCED_CSP_HEADER)).toEqual([
      IMG_SRC_DIRECTIVE,
      UPGRADE_INSECURE_REQUESTS_DIRECTIVE,
    ]);
  });
});
