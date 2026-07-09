export interface NoteCursor {
  u: string;
  i: string;
}

export function encodeNoteCursor(cursor: NoteCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeNoteCursor(raw: string): NoteCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8')
    );
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as NoteCursor).u === 'string' &&
      typeof (parsed as NoteCursor).i === 'string'
    ) {
      return { u: (parsed as NoteCursor).u, i: (parsed as NoteCursor).i };
    }
    return null;
  } catch {
    return null;
  }
}

function byRecencyDesc(
  a: { id: string; updatedAt: string },
  b: { id: string; updatedAt: string }
): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt < b.updatedAt ? 1 : -1;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Keyset-paginates items by (updatedAt desc, id desc) with an opaque cursor.
 * An invalid or missing cursor starts from the beginning; nextCursor is only
 * present when more items remain.
 */
export function paginateByRecency<T extends { id: string; updatedAt: string }>(
  items: T[],
  limit: number,
  cursor?: string
): { page: T[]; nextCursor?: string } {
  const sorted = [...items].sort(byRecencyDesc);
  const pointer = cursor ? decodeNoteCursor(cursor) : null;
  const start = pointer
    ? sorted.findIndex(
        (n) => byRecencyDesc(n, { id: pointer.i, updatedAt: pointer.u }) > 0
      )
    : 0;
  const from = start === -1 ? sorted.length : start;
  const page = sorted.slice(from, from + limit);
  const hasMore = from + limit < sorted.length;
  const last = page[page.length - 1];
  return {
    page,
    ...(hasMore && last
      ? { nextCursor: encodeNoteCursor({ u: last.updatedAt, i: last.id }) }
      : {}),
  };
}
