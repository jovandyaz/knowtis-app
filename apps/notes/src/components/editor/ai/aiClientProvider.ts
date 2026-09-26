import { captureProductEvent } from '@/lib/analytics/product-events';

import { aiClient } from '@knowtis/api-client';
import type { GhostTextProvider, GhostTextStreamInput } from '@knowtis/editor';
import type { CompletionAIAction } from '@knowtis/shared-types';

const EMPTY: AsyncIterable<{ text: string }> = (async function* () {})();

type Event =
  | { kind: 'chunk'; text: string }
  | { kind: 'done' }
  | { kind: 'error'; error: unknown };

/**
 * Bridges the singleton callback-based `aiClient.stream` API into the
 * AsyncIterable contract expected by `@knowtis/editor` providers.
 *
 * Shared by the editor extensions whose only differentiator is the
 * `CompletionAIAction` they invoke.
 *
 * Behavior:
 *  - Short-circuits BEFORE calling `aiClient.stream` if the input signal is
 *    already aborted. Critical: `aiClient` is a singleton and `stream(...)`
 *    cancels any prior in-flight stream, so an unconditional call from a
 *    pre-aborted request would collaterally cancel unrelated AI work.
 *  - Forwards `AbortSignal` aborts to the underlying `aiClient` handle.
 *  - Surfaces stream errors by throwing from the iterator.
 */
export function createAiClientProvider(
  action: CompletionAIAction
): GhostTextProvider {
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
  action: CompletionAIAction,
  input: GhostTextStreamInput
): AsyncIterable<{ text: string }> {
  const buffer: Event[] = [];
  let aborted = false;
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
    aborted = true;
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
      // A stream that errors after producing text must still render that text
      // first, so the UI matches what the user already saw; the error surfaces
      // on the next pull.
      const ev = buffer.shift() as Event;
      if (ev.kind === 'error') {
        throw ev.error;
      }
      if (ev.kind === 'done') {
        if (!aborted) {
          captureProductEvent('ai response completed', {
            source: 'editor',
            assistant_type: 'ghost_text',
            action,
          });
        }
        return;
      }
      yield { text: ev.text };
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    handle.cancel();
  }
}
