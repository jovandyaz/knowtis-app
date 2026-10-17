const KEY_PREFIX_LENGTH = 8;
const KEY_SUFFIX_LENGTH = 4;
const MIN_HINTED_KEY_LENGTH = 20;

export function keyPrefixOf(apiKey: string): string {
  return apiKey.slice(0, KEY_PREFIX_LENGTH);
}

export function keySuffixOf(apiKey: string): string | null {
  return apiKey.length < MIN_HINTED_KEY_LENGTH
    ? null
    : apiKey.slice(-KEY_SUFFIX_LENGTH);
}
