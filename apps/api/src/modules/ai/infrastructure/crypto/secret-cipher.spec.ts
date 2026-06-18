import { randomBytes } from 'node:crypto';

import { decryptSecret, encryptSecret } from './secret-cipher';

describe('secret-cipher', () => {
  const masterKey = randomBytes(32);

  it('round-trips a secret', () => {
    const enc = encryptSecret('sk-ant-secret-123', masterKey);
    expect(enc.ciphertext).not.toContain('sk-ant');
    expect(decryptSecret(enc, masterKey)).toBe('sk-ant-secret-123');
  });

  it('uses a fresh iv per encryption', () => {
    const a = encryptSecret('same', masterKey);
    const b = encryptSecret('same', masterKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('throws when the auth tag is tampered', () => {
    const enc = encryptSecret('secret', masterKey);
    const tampered = { ...enc, authTag: randomBytes(16).toString('base64') };
    expect(() => decryptSecret(tampered, masterKey)).toThrow();
  });

  it('throws when decrypted with the wrong key', () => {
    const enc = encryptSecret('secret', masterKey);
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
  });
});
