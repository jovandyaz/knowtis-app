import { describe, expect, it } from 'vitest';

import { classifyBearer } from '../auth/credentials.js';

describe('classifyBearer', () => {
  it('should classify a knowtis_mcp_ prefixed token as an api-key', () => {
    expect(classifyBearer('knowtis_mcp_test_abcdef')).toBe('api-key');
  });

  it('should classify any other bearer token as oauth', () => {
    expect(classifyBearer('eyJhbGciOiJFUzI1NiJ9.payload.sig')).toBe('oauth');
  });
});
