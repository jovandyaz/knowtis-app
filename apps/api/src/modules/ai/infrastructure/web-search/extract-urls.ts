const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+/gi;

export function extractHttpUrls(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.match(URL_PATTERN) ?? []) {
    const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, '');
    try {
      seen.add(new URL(trimmed).href);
    } catch {
      // skip malformed matches
    }
  }
  return [...seen];
}
