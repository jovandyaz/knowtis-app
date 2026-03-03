import { parseTokenExpiry } from '../utils/token-expiry';

function createJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

describe('parseTokenExpiry', () => {
  it('should extract exp claim and convert to milliseconds', () => {
    const expSeconds = 1700000000;
    const token = createJwt({ sub: '1', exp: expSeconds });

    expect(parseTokenExpiry(token)).toBe(expSeconds * 1000);
  });

  it('should return null for JWT without exp claim', () => {
    const token = createJwt({ sub: '1' });

    expect(parseTokenExpiry(token)).toBeNull();
  });

  it('should return null for malformed token', () => {
    expect(parseTokenExpiry('not-a-jwt')).toBeNull();
    expect(parseTokenExpiry('')).toBeNull();
    expect(parseTokenExpiry('a.b')).toBeNull();
  });

  it('should return null for non-numeric exp', () => {
    const token = createJwt({ exp: 'not-a-number' });

    expect(parseTokenExpiry(token)).toBeNull();
  });

  it('should return null for invalid base64 payload', () => {
    expect(parseTokenExpiry('header.!!!invalid!!!.signature')).toBeNull();
  });
});
