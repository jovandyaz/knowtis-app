import { JWT_VERIFICATION_KEY_SELECTOR } from '@jovandyaz/auth-nestjs';
import { Logger, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { buildCorsOptions } from '../../config/cors-origins';
import { BearerIdentityResolver } from '../../core/auth/bearer-identity.resolver';
import { GlobalExceptionFilter } from '../../core/filters/http-exception.filter';
import { UserScopedThrottlerGuard } from '../../core/throttling/user-scoped-throttler.guard';
import { applyBodyParsersExcludingOauth } from '../oauth/oidc-mount.middleware';
import { applyCspReportBodyParser } from './csp-report-body-parser';
import { SecurityModule } from './security.module';

const REPORTS_PATH = '/api/v1/csp-reports';
const FRONTEND_ORIGIN = 'https://knowtis.app';
const LEGACY_TYPE = 'application/csp-report';
const REPORTING_API_TYPE = 'application/reports+json';
const VIOLATION_EVENT = 'security.csp.violation';
const TRUNCATED_EVENT = 'security.csp.violations_truncated';
// Spelled out rather than imported: a limit read from the value under test
// would keep passing wherever that value drifted to.
const APP_DEFAULT_REQUESTS_PER_MINUTE = 60;
const REPORT_REQUESTS_PER_MINUTE = 30;
const LOGGED_GROUPS_PER_REQUEST = 20;
const BODY_LIMIT_BYTES = 64 * 1024;
const LARGE_BATCH_BYTES = 60 * 1024;
const OVER_BODY_LIMIT_BYTES = 65 * 1024;
const EDGE_IP = '203.0.113.7';
const OTHER_EDGE_IP = '203.0.113.8';

const EXFILTRATED = 'd=private-note-text';
const SHARE_TOKEN = 'a3f9'.repeat(16);
const NOTE_ID = '5b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const POLICY = "default-src 'self'; img-src 'self'";
const IMG_VIOLATION = {
  event: VIOLATION_EVENT,
  effectiveDirective: 'img-src',
  blockedSource: 'https://evil.example',
  documentPath: '/s/:param',
  disposition: 'report',
};

function legacyReport(overrides: Record<string, unknown> = {}) {
  return {
    'csp-report': {
      'document-uri': `https://knowtis.app/notes/${NOTE_ID}?tab=study#top`,
      referrer: `https://knowtis.app/s/${SHARE_TOKEN}`,
      'violated-directive': 'img-src',
      'effective-directive': 'img-src',
      'original-policy': POLICY,
      disposition: 'report',
      'blocked-uri': `https://evil.example/pixel.png?${EXFILTRATED}`,
      'status-code': 200,
      'script-sample': '',
      'source-file': 'https://knowtis.app/assets/index.js',
      'line-number': 12,
      'column-number': 3,
      ...overrides,
    },
  };
}

function cspViolation(body: Record<string, unknown>) {
  return {
    age: 2,
    type: 'csp-violation',
    url: `https://knowtis.app/s/${SHARE_TOKEN}`,
    user_agent: 'Mozilla/5.0',
    body: {
      columnNumber: null,
      lineNumber: null,
      originalPolicy: POLICY,
      referrer: '',
      sample: '',
      sourceFile: null,
      statusCode: 200,
      ...body,
    },
  };
}

describe('POST /api/v1/csp-reports', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let warn: MockInstance;

  function post(
    contentType: string | undefined,
    body: string,
    headers: Record<string, string> = {}
  ) {
    return fetch(`${baseUrl}${REPORTS_PATH}`, {
      method: 'POST',
      headers:
        contentType === undefined
          ? headers
          : { ...headers, 'content-type': contentType },
      body,
    });
  }

  function loggedEvents(event: string): Record<string, unknown>[] {
    return warn.mock.calls
      .map(([entry]) => entry as Record<string, unknown>)
      .filter((entry) => entry?.['event'] === event);
  }

  function loggedViolations(): Record<string, unknown>[] {
    return loggedEvents(VIOLATION_EVENT);
  }

  function imgViolationFrom(token: string) {
    return cspViolation({
      blockedURL: `https://evil.example/p.png?d=${token}`,
      documentURL: `https://knowtis.app/s/${token}`,
      effectiveDirective: 'img-src',
      disposition: 'report',
    });
  }

  beforeEach(async () => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: APP_DEFAULT_REQUESTS_PER_MINUTE }],
        }),
        JwtModule.register({}),
        SecurityModule,
      ],
      providers: [
        BearerIdentityResolver,
        // Reports carry no credentials, so the resolver never asks for a key.
        { provide: JWT_VERIFICATION_KEY_SELECTOR, useValue: () => null },
        { provide: APP_GUARD, useClass: UserScopedThrottlerGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.set('trust proxy', 1);
    app.useLogger(false);
    applyBodyParsersExcludingOauth(app);
    applyCspReportBodyParser(app);
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
      prefix: 'v',
    });
    app.enableCors(buildCorsOptions([FRONTEND_ORIGIN]));
    app.useGlobalFilters(
      new GlobalExceptionFilter(),
      new I18nValidationExceptionFilter({ detailedErrors: false })
    );
    app.useGlobalPipes(
      new I18nValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app.close();
    warn.mockRestore();
  });

  it('accepts a report-uri report without credentials and logs its violation', async () => {
    const response = await post(LEGACY_TYPE, JSON.stringify(legacyReport()));

    expect(response.status).toBe(204);
    expect(loggedViolations()).toEqual([
      {
        event: VIOLATION_EVENT,
        effectiveDirective: 'img-src',
        blockedSource: 'https://evil.example',
        documentPath: '/notes/:param',
        disposition: 'report',
        count: 1,
      },
    ]);
  });

  it('accepts a Reporting API batch and logs each CSP violation in it', async () => {
    const batch = [
      cspViolation({
        blockedURL: `https://user:secret@cdn.evil.example:8443/a.png?${EXFILTRATED}#frag`,
        disposition: 'report',
        documentURL: `https://knowtis.app/s/${SHARE_TOKEN}?${EXFILTRATED}`,
        effectiveDirective: 'img-src',
      }),
      {
        age: 1,
        type: 'deprecation',
        url: 'https://knowtis.app/',
        user_agent: 'Mozilla/5.0',
        body: { id: 'x', message: 'y' },
      },
      cspViolation({
        blockedURL: 'inline',
        disposition: 'enforce',
        documentURL: 'https://knowtis.app/oauth/consent',
        effectiveDirective: 'script-src-elem',
      }),
    ];

    const response = await post(REPORTING_API_TYPE, JSON.stringify(batch));

    expect(response.status).toBe(204);
    expect(loggedViolations()).toEqual([
      {
        event: VIOLATION_EVENT,
        effectiveDirective: 'img-src',
        blockedSource: 'https://cdn.evil.example:8443',
        documentPath: '/s/:param',
        disposition: 'report',
        count: 1,
      },
      {
        event: VIOLATION_EVENT,
        effectiveDirective: 'script-src-elem',
        blockedSource: 'inline',
        documentPath: '/oauth/consent',
        disposition: 'enforce',
        count: 1,
      },
    ]);
  });

  it('logs identical violations once, with how many arrived', async () => {
    const batch = [
      imgViolationFrom('a1'),
      cspViolation({
        blockedURL: 'eval',
        documentURL: 'https://knowtis.app/study',
        effectiveDirective: 'script-src',
        disposition: 'report',
      }),
      imgViolationFrom('b2'),
      imgViolationFrom('c3'),
    ];

    const response = await post(REPORTING_API_TYPE, JSON.stringify(batch));

    expect(response.status).toBe(204);
    expect(loggedViolations()).toEqual([
      { ...IMG_VIOLATION, count: 3 },
      {
        event: VIOLATION_EVENT,
        effectiveDirective: 'script-src',
        blockedSource: 'eval',
        documentPath: '/study',
        disposition: 'report',
        count: 1,
      },
    ]);
    expect(loggedEvents(TRUNCATED_EVENT)).toEqual([]);
  });

  it('logs at most 20 distinct violations per request and one line for the rest', async () => {
    const distinct = Array.from(
      { length: LOGGED_GROUPS_PER_REQUEST + 5 },
      (_, index) =>
        cspViolation({
          blockedURL: `https://evil-${index}.example/p.png`,
          documentURL: 'https://knowtis.app/',
          effectiveDirective: 'img-src',
          disposition: 'report',
        })
    );
    const firstAgain = distinct.slice(0, 1);
    const droppedAgain = distinct.slice(-1);
    const batch = [
      ...distinct,
      ...firstAgain,
      ...droppedAgain,
      ...droppedAgain,
    ];

    const response = await post(REPORTING_API_TYPE, JSON.stringify(batch));

    expect(response.status).toBe(204);
    const logged = loggedViolations();
    expect(logged).toHaveLength(LOGGED_GROUPS_PER_REQUEST);
    expect(logged.map((entry) => entry['blockedSource'])).toEqual(
      Array.from(
        { length: LOGGED_GROUPS_PER_REQUEST },
        (_, index) => `https://evil-${index}.example`
      )
    );
    expect(logged.map((entry) => entry['count'])).toEqual([
      2,
      ...Array.from({ length: LOGGED_GROUPS_PER_REQUEST - 1 }, () => 1),
    ]);
    expect(loggedEvents(TRUNCATED_EVENT)).toEqual([
      { event: TRUNCATED_EVENT, droppedViolations: 7 },
    ]);
  });

  it('accepts a Reporting API batch close to 64 KB', async () => {
    const batch = [imgViolationFrom('t0')];
    while (JSON.stringify(batch).length < LARGE_BATCH_BYTES) {
      batch.push(imgViolationFrom(`t${batch.length}`));
    }
    const body = JSON.stringify(batch);

    const response = await post(REPORTING_API_TYPE, body);

    expect(body.length).toBeLessThan(BODY_LIMIT_BYTES);
    expect(response.status).toBe(204);
    expect(loggedViolations()).toEqual([
      { ...IMG_VIOLATION, count: batch.length },
    ]);
  });

  it('never logs the blocked URL, the document query or a share token', async () => {
    await post(LEGACY_TYPE, JSON.stringify(legacyReport()));
    await post(
      REPORTING_API_TYPE,
      JSON.stringify([
        cspViolation({
          blockedURL: `https://evil.example/p.png?${EXFILTRATED}`,
          documentURL: `https://knowtis.app/s/${SHARE_TOKEN}`,
          effectiveDirective: 'img-src',
          disposition: 'report',
        }),
      ])
    );

    const logged = JSON.stringify(warn.mock.calls);
    expect(loggedViolations()).toHaveLength(2);
    expect(logged).not.toContain(EXFILTRATED);
    expect(logged).not.toContain(SHARE_TOKEN);
    expect(logged).not.toContain(NOTE_ID);
    expect(logged).not.toContain('secret');
  });

  it.each([
    ['a scheme-only data: source', 'data', 'data'],
    ['a full data: URL', 'data:image/png;base64,iVBORw0KGgo=', 'data'],
    ['eval', 'eval', 'eval'],
    ['wasm-eval', 'wasm-eval', 'wasm-eval'],
    ['a websocket URL', 'wss://evil.example/socket?x=1', 'wss://evil.example'],
  ])('reduces %s to its source', async (_label, blocked, expected) => {
    await post(
      LEGACY_TYPE,
      JSON.stringify(legacyReport({ 'blocked-uri': blocked }))
    );

    expect(loggedViolations().map((entry) => entry['blockedSource'])).toEqual([
      expected,
    ]);
  });

  it.each([
    ['an empty blocked URI', { 'blocked-uri': '' }, 'blockedSource'],
    ['a blocked URI that is no URL', { 'blocked-uri': 'a b' }, 'blockedSource'],
    [
      'a directive that is no directive name',
      { 'effective-directive': "img-src 'self'" },
      'effectiveDirective',
    ],
    ['an unknown disposition', { disposition: 'maybe' }, 'disposition'],
    ['a document URI that is no URL', { 'document-uri': 'x' }, 'documentPath'],
  ])('logs %s without that field', async (_label, overrides, field) => {
    const response = await post(
      LEGACY_TYPE,
      JSON.stringify(legacyReport(overrides))
    );

    expect(response.status).toBe(204);
    const [entry] = loggedViolations();
    expect(entry).toBeDefined();
    expect(Object.keys(entry)).not.toContain(field);
    expect(Object.keys(entry)).toHaveLength(5);
  });

  it.each([
    ['invalid JSON', LEGACY_TYPE, '{"csp-report":'],
    ['a bare JSON string', LEGACY_TYPE, '"csp-report"'],
    ['an object with no csp-report', LEGACY_TYPE, '{}'],
    ['a csp-report that is no object', LEGACY_TYPE, '{"csp-report":"x"}'],
    ['an empty batch', REPORTING_API_TYPE, '[]'],
    ['a batch entry with no type', REPORTING_API_TYPE, '[{"body":{}}]'],
    [
      'a CSP violation with a non-string field',
      REPORTING_API_TYPE,
      '[{"type":"csp-violation","body":{"blockedURL":7}}]',
    ],
    [
      'a CSP violation with no body',
      REPORTING_API_TYPE,
      '[{"type":"csp-violation"}]',
    ],
    ['a report sent as text/plain', 'text/plain', '{"csp-report":{}}'],
    ['no body at all', undefined, ''],
  ])('refuses %s with 400', async (_label, contentType, body) => {
    const response = await post(contentType, body);

    expect(response.status).toBe(400);
    expect(loggedViolations()).toEqual([]);
  });

  it.each([LEGACY_TYPE, REPORTING_API_TYPE])(
    'refuses an oversized %s body with 413',
    async (contentType) => {
      const response = await post(
        contentType,
        JSON.stringify(
          legacyReport({
            'original-policy': 'x'.repeat(OVER_BODY_LIMIT_BYTES),
          })
        )
      );

      expect(response.status).toBe(413);
      expect(loggedViolations()).toEqual([]);
    }
  );

  it('refuses a body in a charset JSON cannot be read in with 415', async () => {
    const response = await post(
      `${LEGACY_TYPE}; charset=latin1`,
      JSON.stringify(legacyReport())
    );

    expect(response.status).toBe(415);
  });

  it('spends a budget per edge IP, tighter than the app default, that a rotated X-Forwarded-For does not refill', async () => {
    const report = JSON.stringify(legacyReport());
    const statuses: number[] = [];
    for (let index = 0; index < REPORT_REQUESTS_PER_MINUTE; index += 1) {
      const headers = {
        'x-real-ip': EDGE_IP,
        'x-forwarded-for': `10.0.0.${index}`,
      };
      statuses.push((await post(LEGACY_TYPE, report, headers)).status);
    }
    const rotated = await post(LEGACY_TYPE, report, {
      'x-real-ip': EDGE_IP,
      'x-forwarded-for': '10.0.1.1',
    });
    const otherEdge = await post(LEGACY_TYPE, report, {
      'x-real-ip': OTHER_EDGE_IP,
      'x-forwarded-for': '10.0.1.1',
    });

    expect(new Set(statuses)).toEqual(new Set([204]));
    expect(rotated.status).toBe(429);
    expect(otherEdge.status).toBe(204);
  });

  it('lets the frontend deliver Reporting API batches cross-origin', async () => {
    const preflight = await fetch(`${baseUrl}${REPORTS_PATH}`, {
      method: 'OPTIONS',
      headers: {
        origin: FRONTEND_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    const delivery = await fetch(`${baseUrl}${REPORTS_PATH}`, {
      method: 'POST',
      headers: { origin: FRONTEND_ORIGIN, 'content-type': REPORTING_API_TYPE },
      body: JSON.stringify([
        cspViolation({
          blockedURL: 'https://evil.example/p.png',
          documentURL: 'https://knowtis.app/',
          effectiveDirective: 'img-src',
          disposition: 'report',
        }),
      ]),
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      FRONTEND_ORIGIN
    );
    expect(preflight.headers.get('access-control-allow-methods')).toContain(
      'POST'
    );
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'content-type'
    );
    expect(delivery.status).toBe(204);
    expect(delivery.headers.get('access-control-allow-origin')).toBe(
      FRONTEND_ORIGIN
    );
  });
});
