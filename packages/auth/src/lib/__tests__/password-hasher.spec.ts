import { describe, expect, it } from 'vitest';

import { createPasswordHasher } from '../password/password-hasher';

describe('createPasswordHasher', () => {
  // Use low salt rounds (4) for fast tests
  const hasher = createPasswordHasher(4);

  it('should hash a password', async () => {
    const hashed = await hasher.hash('MyPassword123!');
    expect(hashed).toBeDefined();
    expect(hashed).not.toBe('MyPassword123!');
  });

  it('should produce different hashes for the same password', async () => {
    const hash1 = await hasher.hash('MyPassword123!');
    const hash2 = await hasher.hash('MyPassword123!');
    expect(hash1).not.toBe(hash2);
  });

  it('should verify a correct password', async () => {
    const hashed = await hasher.hash('CorrectPassword1!');
    const isValid = await hasher.verify('CorrectPassword1!', hashed);
    expect(isValid).toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const hashed = await hasher.hash('CorrectPassword1!');
    const isValid = await hasher.verify('WrongPassword1!', hashed);
    expect(isValid).toBe(false);
  });
});
