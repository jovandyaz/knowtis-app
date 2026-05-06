import { aiClient } from '@knowtis/api-client';
import type { GhostTextProvider, GhostTextStreamInput } from '@knowtis/editor';
import type { AIAction } from '@knowtis/shared-types';

const EMPTY: AsyncIterable<{ text: string }> = (async function* () {})();

type Event =
  | { kind: 'chunk'; text: string }
  | { kind: 'done' }
  | { kind: 'error'; error: unknown };

/**
 * Bridges the singleton callback-based `aiClient.stream` API into the
 * AsyncIterable contract expected by `@knowtis/editor` providers.
 *
 * Designed to be reused by GhostText (1.5), AIBlock (1.6), and other
 * extensions whose only differentiator is the `AIAction` they invoke.
 *
 * Behavior:
 *  - Short-circuits BEFORE calling `aiClient.stream` if the input signal is
 *    already aborted. Critical: `aiClient` is a singleton and `stream(...)`
 *    cancels any prior in-flight stream, so an unconditional call from a
 *    pre-aborted request would collaterally cancel unrelated AI work.
 *  - Forwards `AbortSignal` aborts to the underlying `aiClient` handle.
 *  - Surfaces stream errors by throwing from the iterator.
 */
export function createAiClientProvider(action: AIAction): GhostTextProvider {
  return {
    stream(input: GhostTextStreamInput) {
      if (input.signal.aborted) {
        return EMPTY;
      }
      return pump(action, input);
    },
  };
}

async function* pump(
  action: AIAction,
  input: GhostTextStreamInput
): AsyncIterable<{ text: string }> {
  const buffer: Event[] = [];
  let notify: (() => void) | null = null;
  const wait = () =>
    new Promise<void>((resolve) => {
      notify = resolve;
    });
  const wake = () => {
    const n = notify;
    notify = null;
    n?.();
  };

  const { content, suffix, signal } = input;

  const handle = aiClient.stream(
    { action, content, ...(suffix && { suffix }) },
    {
      onChunk: ({ text }) => {
        buffer.push({ kind: 'chunk', text });
        wake();
      },
      onDone: () => {
        buffer.push({ kind: 'done' });
        wake();
      },
      onError: (payload) => {
        const error =
          payload instanceof Error
            ? payload
            : new Error(payload?.message ?? 'AI stream failed');
        buffer.push({ kind: 'error', error });
        wake();
      },
    }
  );

  const onAbort = () => {
    handle.cancel();
    buffer.push({ kind: 'done' });
    wake();
  };

  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    while (true) {
      while (buffer.length === 0) {
        await wait();
      }
      // Drain buffered chunks BEFORE surfacing errors. Deliberate policy
      // (Improvement 5): if the stream produced text and then errored, the
      // chunks render first and the consumer's UI stays consistent with
      // what the user has already seen; the error throws on the next pull.
      const ev = buffer.shift() as Event;
      if (ev.kind === 'error') {
        throw ev.error;
      }
      if (ev.kind === 'done') {
        return;
      }
      yield { text: ev.text };
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
