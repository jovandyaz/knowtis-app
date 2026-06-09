import { describe, expect, it } from 'vitest';

import { deriveWsBaseUrl } from './ws-url';

describe('deriveWsBaseUrl', () => {
  it('strips a trailing /api segment', () => {
    expect(deriveWsBaseUrl('https://api.example.com/api')).toBe(
      'https://api.example.com'
    );
  });

  it('strips a trailing versioned /api/vN segment', () => {
    expect(deriveWsBaseUrl('https://api.example.com/api/v1')).toBe(
      'https://api.example.com'
    );
  });

  it('strips trailing slashes after the api segment', () => {
    expect(deriveWsBaseUrl('https://api.example.com/api/v1/')).toBe(
      'https://api.example.com'
    );
  });

  it('leaves a URL without an /api suffix unchanged', () => {
    expect(deriveWsBaseUrl('https://my-api.example.com')).toBe(
      'https://my-api.example.com'
    );
  });

  it('does not corrupt URLs containing /api mid-path', () => {
    expect(deriveWsBaseUrl('https://example.com/api/notes')).toBe(
      'https://example.com/api/notes'
    );
    expect(deriveWsBaseUrl('https://example.com/apiary/api/v2')).toBe(
      'https://example.com/apiary'
    );
  });

  it('does not corrupt hostnames that contain "api"', () => {
    expect(deriveWsBaseUrl('https://api.example.com')).toBe(
      'https://api.example.com'
    );
  });
});
