import type { EvalTranscript } from './transcript';

/**
 * Rejects a run before it spends tokens when the fallback chain would not
 * open the turn with the pinned model (streamWithChain opens with the first
 * candidate): a cooldown or a missing provider key would grade another model,
 * and the post-run check only catches that after the turn is paid. When every
 * candidate is cooling the chain degenerates to pinned-first and this check
 * passes — assertPinnedModelServed remains the authoritative gate.
 */
export function assertPinnedModelAvailable(
  candidates: readonly string[],
  pinned: string
): void {
  if (candidates.length === 0) {
    throw new Error(`Eval pre-flight: no candidate can serve '${pinned}'`);
  }
  if (candidates[0] !== pinned) {
    throw new Error(
      `Eval pre-flight: the chain would open with '${candidates[0]}' instead of the pinned '${pinned}' — ` +
        'it is cooling down or its provider key is missing; refusing to pay for a turn that cannot be graded'
    );
  }
}

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
