import { hashToken } from '@jovandyaz/auth/server';
import { Injectable } from '@nestjs/common';

const TOKEN_HASH_KEY_BYTES = 32;

/** Hashes tokens with the server-side key, so a leaked hash is useless offline. */
@Injectable()
export class TokenHasher {
  constructor(private readonly key: string) {
    if (Buffer.from(key, 'base64').length !== TOKEN_HASH_KEY_BYTES) {
      throw new Error(
        `TOKEN_HASH_KEY must decode to ${TOKEN_HASH_KEY_BYTES} bytes — generate one with: openssl rand -base64 32`
      );
    }
  }

  hash(token: string): string {
    return hashToken(token, this.key);
  }
}
