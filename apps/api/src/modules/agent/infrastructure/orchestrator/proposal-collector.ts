import type { ProposedMutation } from '../../domain/proposed-mutation';

/**
 * Per-run sink for proposals produced by propose-tools, so the full proposal
 * (incl. previewHtml) never travels back into the model context as a tool
 * result. One proposal per run: a later capture replaces an earlier one.
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
