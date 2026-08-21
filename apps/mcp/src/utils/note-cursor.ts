interface PageCursor {
  p: number;
}

export function encodePageCursor(page: number): string {
  return Buffer.from(JSON.stringify({ p: page } satisfies PageCursor)).toString(
    'base64url'
  );
}

/** Resolves an opaque cursor to a 1-based page; anything unreadable restarts from the first page. */
export function decodePageCursor(raw?: string): number {
  if (!raw) {
    return 1;
  }
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8')
    );
    const page = (parsed as PageCursor | null)?.p;
    return typeof page === 'number' && Number.isInteger(page) && page >= 1
      ? page
      : 1;
  } catch {
    return 1;
  }
}

/** The cursor for the page after this one, or nothing when the server has no more rows. */
export function nextPageCursor(envelope: {
  total: number;
  page: number;
  limit: number;
}): string | undefined {
  return envelope.page * envelope.limit < envelope.total
    ? encodePageCursor(envelope.page + 1)
    : undefined;
}
