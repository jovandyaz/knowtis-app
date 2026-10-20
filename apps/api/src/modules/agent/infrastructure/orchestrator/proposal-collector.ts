import type { ProposedMutation } from '../../domain/proposed-mutation';

/**
 * Per-run proposal sink so the full proposal never re-enters the model context;
 * one per run — the first capture is kept and every later one is refused.
 */
export class ProposalCollector {
  private proposal: ProposedMutation | null = null;

  /** Keeps `proposal` and answers true, or answers false and keeps nothing when the run already holds one. */
  capture(proposal: ProposedMutation): boolean {
    if (this.proposal) {
      return false;
    }
    this.proposal = proposal;
    return true;
  }

  get captured(): ProposedMutation | null {
    return this.proposal;
  }
}
