import { describe, expect, it } from 'vitest';

import { RETRY_AFTER_HEADER } from '../core/http/retry-after.header';
import { buildAllowedOrigins, buildCorsOptions } from './cors-origins';

describe('buildAllowedOrigins', () => {
  it('returns exactly the frontend URL in production', () => {
    expect(buildAllowedOrigins('production', 'https://knowtis.app')).toEqual([
      'https://knowtis.app',
    ]);
  });

  it('excludes localhost origins in production', () => {
    const origins = buildAllowedOrigins('production', 'https://knowtis.app');

    expect(origins).not.toContain('http://localhost:4200');
    expect(origins).not.toContain('http://localhost:4400');
  });

  it('includes localhost dev origins outside production', () => {
    expect(
      buildAllowedOrigins('development', 'https://staging.knowtis.app')
    ).toEqual([
      'https://staging.knowtis.app',
      'http://localhost:4200',
      'http://localhost:4400',
    ]);
  });

  it('does not duplicate the frontend URL when it is a localhost origin', () => {
    expect(buildAllowedOrigins('development', 'http://localhost:4200')).toEqual(
      ['http://localhost:4200', 'http://localhost:4400']
    );
  });
});

describe('backoffice origin', () => {
  it('includes the backoffice URL in production when set', () => {
    expect(
      buildAllowedOrigins(
        'production',
        'https://knowtis.app',
        'https://admin.knowtis.app'
      )
    ).toEqual(['https://knowtis.app', 'https://admin.knowtis.app']);
  });

  it('excludes the backoffice entry when unset', () => {
    expect(buildAllowedOrigins('production', 'https://knowtis.app')).toEqual([
      'https://knowtis.app',
    ]);
  });

  it('includes backoffice URL alongside local dev origins outside production', () => {
    const origins = buildAllowedOrigins(
      'development',
      'http://localhost:4200',
      'http://localhost:4400'
    );
    expect(origins).toContain('http://localhost:4400');
    expect(origins).toContain('http://localhost:4200');
  });

  it('does not duplicate the backoffice URL when it matches a local dev origin', () => {
    const origins = buildAllowedOrigins(
      'development',
      'http://localhost:4200',
      'http://localhost:4400'
    );
    expect(origins.filter((o) => o === 'http://localhost:4400')).toHaveLength(
      1
    );
  });
});

describe('buildCorsOptions', () => {
  const ORIGINS = ['https://knowtis.app'];

  it('exposes Retry-After, which is not CORS-safelisted', () => {
    expect(buildCorsOptions(ORIGINS).exposedHeaders).toEqual([
      RETRY_AFTER_HEADER,
    ]);
  });

  it('keeps the origin allowlist and credentialed requests', () => {
    expect(buildCorsOptions(ORIGINS)).toEqual({
      origin: ORIGINS,
      credentials: true,
      exposedHeaders: [RETRY_AFTER_HEADER],
    });
  });
});
