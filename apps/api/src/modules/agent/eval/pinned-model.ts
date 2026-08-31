import type { EvalTranscript } from './transcript';

/**
 * Rejects a turn that cannot be graded against the model it pinned. Every
 * terminal event that reports usage carries the served model, so a null value
 * means the turn never reached a model — which only a failed turn can do, and
 * that failure is the more informative signal to surface.
 */
export function assertPinnedModelServed(
  transcript: Pick<EvalTranscript, 'servedModel' | 'error'>,
  pinned: string
): void {
  if (transcript.servedModel === null) {
    if (transcript.error !== null) {
      return;
    }
    throw new Error(
      `Eval turn reported no served model while ending without an error: it cannot be graded against the pinned '${pinned}'`
    );
  }
  if (transcript.servedModel !== pinned) {
    throw new Error(
      `Eval turn was served by '${transcript.servedModel}' instead of the pinned '${pinned}': ` +
        'the fallback chain took over, so this run would grade the wrong model'
    );
  }
}
