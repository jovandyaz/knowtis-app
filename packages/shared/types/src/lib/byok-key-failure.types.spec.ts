import { describe, expect, it } from 'vitest';

import { isByokKeyFailedError } from './byok-key-failure.types';

describe('isByokKeyFailedError', () => {
  it('recognises a key failure by its code', () => {
    expect(
      isByokKeyFailedError({
        code: 'AI_BYOK_KEY_FAILED',
        message: 'x',
        provider: 'openai',
        kind: 'credit',
      } as { code: string })
    ).toBe(true);
  });

  it('rejects any other code', () => {
    expect(isByokKeyFailedError({ code: 'AI_PROVIDER_ERROR' })).toBe(false);
  });
});
