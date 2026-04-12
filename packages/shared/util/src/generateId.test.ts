import { describe, expect, it } from 'vitest';

import { generateId } from './generateId';

describe('generateId', () => {
  it('should generate a non-empty string', () => {
    const id = generateId();

    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('should generate a valid UUID v4 format', () => {
    const id = generateId();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(id).toMatch(uuidV4Regex);
  });

  it('should generate unique IDs on each call', () => {
    const ids = new Set<string>();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      ids.add(generateId());
    }

    expect(ids.size).toBe(iterations);
  });

  it('should generate IDs with correct length (36 characters)', () => {
    const id = generateId();

    expect(id.length).toBe(36);
  });
});
