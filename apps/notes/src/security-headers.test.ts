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

function allRoutesHeaders(): Map<string, string> {
  const config = JSON.parse(readFileSync(VERCEL_CONFIG_PATH, 'utf8')) as {
    headers?: VercelHeaderRule[];
  };
  const rule = config.headers?.find(
    ({ source }) => source === ALL_ROUTES_SOURCE
  );
  return new Map(rule?.headers.map(({ key, value }) => [key, value]));
}

function cspDirectives(): [string, string[]][] {
  return (allRoutesHeaders().get(CSP_HEADER) ?? '')
    .split(';')
    .map((directive) => directive.trim().split(/\s+/))
    .filter(([name]) => name !== '')
    .map(([name, ...sources]) => [name, sources]);
}

function sourcesOf(directive: string): string[] | undefined {
  return new Map(cspDirectives()).get(directive);
}

describe('notes security headers (vercel.json)', () => {
  it('sends the referrer, sniffing and permissions policies on every route', () => {
    const headers = allRoutesHeaders();

    expect(headers.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Permissions-Policy')).toBe(
      'camera=(), geolocation=(), microphone=(self)'
    );
  });

  it('declares each CSP directive once', () => {
    const names = cspDirectives().map(([name]) => name);

    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  it('loads images only from the app itself and its own blob store', () => {
    expect(sourcesOf('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      `https://${STORED_IMAGE_HOST}`,
    ]);
  });

  it('runs only same-origin scripts and no plugins', () => {
    expect(sourcesOf('script-src')).toEqual(["'self'"]);
    expect(sourcesOf('object-src')).toEqual(["'none'"]);
  });

  it('connects only to the app itself and the API over HTTPS and WSS', () => {
    expect(sourcesOf('connect-src')).toEqual([
      "'self'",
      `https://${API_HOST}`,
      `wss://${API_HOST}`,
    ]);
  });
});
