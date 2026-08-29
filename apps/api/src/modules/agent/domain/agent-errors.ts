import { AGENT_EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

export interface AgentDomainError {
  readonly code: string;
  readonly message: string;
}

const make = (code: string, message: string): AgentDomainError => ({
  code,
  message,
});

export const AgentErrors = {
  invalidProposal: (reason: string) =>
    make('AGENT_INVALID_PROPOSAL', `Invalid proposal: ${reason}`),
  staleNote: (noteId: string) =>
    make(
      'AGENT_STALE_NOTE',
      `Note ${noteId} changed since the proposal was created`
    ),
  proposalExpired: () =>
    make('AGENT_PROPOSAL_EXPIRED', 'This proposal expired; ask again'),
  permissionDenied: () =>
    make('AGENT_PERMISSION_DENIED', 'You cannot perform this action'),
  emailNotVerified: () =>
    make(
      AGENT_EMAIL_NOT_VERIFIED_CODE,
      'Verify your email address before sharing this note'
    ),
  commitFailed: (code: string, message: string) =>
    make(
      'AGENT_COMMIT_FAILED',
      `Could not apply the change (${code}): ${message}`
    ),
  sanitizeRejected: () =>
    make('AGENT_SANITIZE_REJECTED', 'Generated content could not be sanitized'),
  noteNotFound: (noteId: string) =>
    make('AGENT_NOTE_NOT_FOUND', `Note ${noteId} not found or not accessible`),
  targetUserNotFound: (email: string) =>
    make('AGENT_TARGET_USER_NOT_FOUND', `No user found for ${email}`),
} as const;
