import { describe, expect, it } from 'vitest';

import { WebFetchAllowlist } from './web-fetch-allowlist';

describe('WebFetchAllowlist', () => {
  it('allows a url seeded from the user message', () => {
    const allow = new WebFetchAllowlist();
    allow.seedFromText('please read https://example.com/article now');
    expect(allow.has('https://example.com/article')).toBe(true);
  });

  it('allows a url added from a search hit', () => {
    const allow = new WebFetchAllowlist();
    allow.add('https://docs.test/page');
    expect(allow.has('https://docs.test/page')).toBe(true);
  });

  it('rejects a url that was never seen', () => {
    const allow = new WebFetchAllowlist();
    allow.seedFromText('hello with no links');
    expect(allow.has('https://evil.com/?d=secret')).toBe(false);
  });

  it('normalizes before matching and ignores malformed input', () => {
    const allow = new WebFetchAllowlist();
    allow.add('https://example.com/a');
    expect(allow.has('https://example.com/a')).toBe(true);
    expect(allow.has('not a url')).toBe(false);
  });

  it('canonicalizes a seeded root url so a slash-less lookup matches', () => {
    const allow = new WebFetchAllowlist();
    allow.seedFromText('visit https://example.com');
    expect(allow.has('https://example.com')).toBe(true);
  });

  it('folds host case and drops the default port when matching', () => {
    const allow = new WebFetchAllowlist();
    allow.add('https://Example.COM:443/a');
    expect(allow.has('https://example.com/a')).toBe(true);
  });
});
