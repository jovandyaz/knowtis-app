export const KEY_FINGERPRINTER = Symbol('KEY_FINGERPRINTER');

/** HMAC of a provider key under TOKEN_HASH_KEY: tells which key a stored listing describes without storing the key. */
export interface KeyFingerprinter {
  hash(apiKey: string): string;
}
