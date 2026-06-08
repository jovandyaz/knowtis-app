import type { ProposedMutation } from '../proposed-mutation';

export interface PendingMutationRecord {
  readonly userId: string;
  readonly mutation: ProposedMutation;
  readonly toolName: string;
}

export interface PendingMutationStore {
  save(record: PendingMutationRecord): Promise<void>;
  take(
    proposalId: string,
    userId: string
  ): Promise<PendingMutationRecord | null>;
}

export const PENDING_MUTATION_STORE = Symbol('PENDING_MUTATION_STORE');
