import { describe, expect, it } from 'vitest';

import { clientIpOf, realIpOf } from './client-ip';

describe('realIpOf', () => {
  it('returns the X-Real-IP value', () => {
    expect(realIpOf({ 'x-real-ip': '203.0.113.7' })).toBe('203.0.113.7');
  });

  it('is undefined when the header is absent', () => {
    expect(realIpOf({})).toBeUndefined();
  });

  it('takes the first element when the header arrives as an array', () => {
    expect(realIpOf({ 'x-real-ip': ['203.0.113.7', '198.51.100.9'] })).toBe(
      '203.0.113.7'
    );
  });

  it('never reads X-Forwarded-For', () => {
    expect(realIpOf({ 'x-forwarded-for': '203.0.113.7' })).toBeUndefined();
  });
});

describe('clientIpOf', () => {
  it('prefers the edge-set X-Real-IP over req.ip', () => {
    expect(
      clientIpOf({ headers: { 'x-real-ip': '203.0.113.7' }, ip: '10.0.0.1' })
    ).toBe('203.0.113.7');
  });

  it('falls back to req.ip without the header', () => {
    expect(clientIpOf({ headers: {}, ip: '10.0.0.1' })).toBe('10.0.0.1');
  });

  it('never returns an empty key', () => {
    expect(clientIpOf({ headers: {} })).toBe('unknown');
  });
});
