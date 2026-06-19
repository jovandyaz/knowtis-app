import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { EncryptedSecret } from '@knowtis/shared-types';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const MASTER_KEY_BYTES = 32;

function assertValidMasterKey(masterKey: Buffer): void {
  if (masterKey.length !== MASTER_KEY_BYTES) {
    throw new Error('BYOK_ENCRYPTION_KEY must decode to 32 bytes');
  }
}

export function encryptSecret(
  plaintext: string,
  masterKey: Buffer
): EncryptedSecret {
  assertValidMasterKey(masterKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret(
  parts: EncryptedSecret,
  masterKey: Buffer
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    masterKey,
    Buffer.from(parts.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(parts.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parts.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
