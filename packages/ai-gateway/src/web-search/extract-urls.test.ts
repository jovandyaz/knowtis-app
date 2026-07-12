import { describe, expect, it } from 'vitest';

import { extractHttpUrls } from './extract-urls';

describe('extractHttpUrls', () => {
  it('extracts and normalizes http(s) urls', () => {
    const urls = extractHttpUrls(
      'see https://example.com/a and http://foo.test/b?x=1'
    );
    expect(urls).toContain('https://example.com/a');
    expect(urls).toContain('http://foo.test/b?x=1');
  });

  it('de-duplicates normalized urls', () => {
    const urls = extractHttpUrls('https://example.com/ https://example.com/');
    expect(urls).toEqual(['https://example.com/']);
  });

  it('ignores non-http schemes and plain text', () => {
    expect(extractHttpUrls('no links; ftp://x.test file:///etc')).toEqual([]);
  });
});
