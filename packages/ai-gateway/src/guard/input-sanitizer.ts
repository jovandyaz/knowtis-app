/**
 * Strip control characters except newline and tab, then trim.
 */
export function sanitizeContent(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}
