/** Escapes LIKE/ILIKE wildcards so user input matches literally. */
export function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}
