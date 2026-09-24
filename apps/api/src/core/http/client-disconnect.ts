import type { ServerResponse } from 'node:http';

/** A signal that aborts when the client disconnects before `response` has been sent. */
export function abortOnClientDisconnect(response: ServerResponse): AbortSignal {
  const controller = new AbortController();
  // The request's own 'close' fires as soon as its body has been read, so only
  // the response's tells a client that left early from a finished exchange.
  response.once('close', () => {
    if (!response.writableEnded) {
      controller.abort();
    }
  });
  return controller.signal;
}
