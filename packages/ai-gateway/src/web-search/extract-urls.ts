const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+/gi;

export function extractHttpUrls(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.match(URL_PATTERN) ?? []) {
    try {
      seen.add(new URL(raw).href);
    } catch {
      // skip malformed matches
    }
  }
  return [...seen];
}
