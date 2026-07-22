import type { ProposedMutation } from '../../domain/proposed-mutation';

/**
 * Per-run proposal sink so the full proposal (incl. previewHtml) never re-enters
 * the model context; one per run — a later capture replaces an earlier one.
 */
export class ProposalCollector {
  private proposal: ProposedMutation | null = null;

  capture(proposal: ProposedMutation): void {
    this.proposal = proposal;
  }

  get captured(): ProposedMutation | null {
    return this.proposal;
  }
}
