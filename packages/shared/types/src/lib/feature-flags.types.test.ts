import { describe, expect, it } from 'vitest';

import { FEATURE_FLAG_KEYS } from './feature-flags.types';

describe('feature flag keys', () => {
  it('ships a single kill-switch flag', () => {
    expect(FEATURE_FLAG_KEYS).toEqual({ AI_ENABLED: 'ai_enabled' });
  });
});
