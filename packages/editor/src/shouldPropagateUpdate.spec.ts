import { describe, expect, it } from 'vitest';

import { shouldPropagateUpdate } from './shouldPropagateUpdate';

describe('shouldPropagateUpdate', () => {
  it.each<[{ isInitializing: boolean; isSynced: boolean }, boolean]>([
    [{ isInitializing: false, isSynced: true }, true],
    [{ isInitializing: true, isSynced: true }, false],
    [{ isInitializing: false, isSynced: false }, false],
    [{ isInitializing: true, isSynced: false }, false],
  ])('returns %s for %j', (input, expected) => {
    expect(shouldPropagateUpdate(input)).toBe(expected);
  });
});
