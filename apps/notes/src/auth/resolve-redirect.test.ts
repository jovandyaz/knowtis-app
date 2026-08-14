import { describe, expect, it } from 'vitest';

import { resolvePostLoginRedirect } from './resolve-redirect';

describe('resolvePostLoginRedirect', () => {
  it('returns an internal path unchanged', () => {
    expect(resolvePostLoginRedirect('/s/abc123')).toBe('/s/abc123');
  });

  it('falls back to the dashboard when no redirect is given', () => {
    expect(resolvePostLoginRedirect()).toBe('/dashboard');
  });

  it('falls back to the dashboard for the login route to avoid a loop', () => {
    expect(resolvePostLoginRedirect('/login')).toBe('/dashboard');
  });

  it.each([
    'https://example.com/pwned',
    '//example.com/pwned',
    '/\\example.com',
    'javascript:alert(1)',
    'dashboard',
  ])('refuses %s and falls back to the dashboard', (redirect) => {
    expect(resolvePostLoginRedirect(redirect)).toBe('/dashboard');
  });
});
