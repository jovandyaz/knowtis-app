import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { AgentErrors, type AgentDomainError } from '../domain/agent-errors';
import {
  PENDING_MUTATION_STORE,
  type PendingMutationStore,
} from '../domain/ports/pending-mutation.store';

export interface RejectMutationInput {
  readonly proposalId: string;
  readonly userId: string;
  readonly reason?: string;
}

export interface RejectMutationOutput {
  readonly outcome: string;
  readonly toolName: string;
}

@Injectable()
export class RejectMutationHandler {
  constructor(
    @Inject(PENDING_MUTATION_STORE) private readonly store: PendingMutationStore
  ) {}

  async execute(
    input: RejectMutationInput
  ): Promise<Result<RejectMutationOutput, AgentDomainError>> {
    const record = await this.store.take(input.proposalId, input.userId);
    if (!record) {
      return err(AgentErrors.proposalExpired());
    }
    const reason = input.reason?.trim();
    return ok({
      toolName: record.toolName,
      outcome: `The user rejected the proposal${reason ? `: "${reason}"` : ''}. Acknowledge and offer to adjust.`,
    });
  }
}
