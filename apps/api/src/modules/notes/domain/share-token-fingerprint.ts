import { createHash } from 'node:crypto';

export function shareTokenFingerprint(token: string | null): string | null {
  return token === null
    ? null
    : createHash('sha256')
        .update('knowtis:share-link:v1\0')
        .update(token)
        .digest('hex');
}
