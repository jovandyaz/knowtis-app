import { HttpStatus } from '@nestjs/common';
import { vi, type Mock } from 'vitest';

export interface StubbedListingReply {
  readonly body: unknown;
  readonly status?: number;
}

export type ListingFetch = (url: URL, init: RequestInit) => Promise<Response>;

function responseOf(reply: StubbedListingReply | undefined): Response {
  return new Response(JSON.stringify(reply?.body ?? null), {
    status: reply?.status ?? HttpStatus.OK,
  });
}

/** Stubs the global `fetch` so each call answers the next reply as JSON (status 200 unless given), repeating the last one. */
export function stubListingFetch(
  ...replies: readonly StubbedListingReply[]
): Mock<ListingFetch> {
  let answered = 0;
  const fetchMock = vi.fn<ListingFetch>(async () => {
    const reply = replies[Math.min(answered, replies.length - 1)];
    answered += 1;
    return responseOf(reply);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Stubs the global `fetch` to answer `replies` in order; every later call never settles, even once its signal aborts. */
export function stubListingFetchThenHang(
  ...replies: readonly StubbedListingReply[]
): Mock<ListingFetch> {
  let answered = 0;
  const fetchMock = vi.fn<ListingFetch>(() => {
    const reply = replies[answered];
    answered += 1;
    return reply === undefined
      ? new Promise<never>(() => undefined)
      : Promise.resolve(responseOf(reply));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The URL and init of the `index`th stubbed call. */
export function listingCall(
  fetchMock: Mock<ListingFetch>,
  index: number
): { readonly url: URL; readonly init: RequestInit } {
  const call = fetchMock.mock.calls[index];
  if (call === undefined) {
    throw new Error(`fetch was called ${fetchMock.mock.calls.length} times`);
  }
  return { url: new URL(String(call[0])), init: call[1] };
}
