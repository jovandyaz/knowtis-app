import { AGENT_EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import type { NoteContentStatus } from './retrieval';

export interface AgentDomainError {
  readonly code: string;
  readonly message: string;
}

const make = (code: string, message: string): AgentDomainError => ({
  code,
  message,
});

const MAX_ECHOED_EDIT_CHARS = 200;

const echo = (text: string): string =>
  text.length <= MAX_ECHOED_EDIT_CHARS
    ? text
    : `${text.slice(0, MAX_ECHOED_EDIT_CHARS)}…`;

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
  editTextNotFound: (position: number, oldText: string) =>
    make(
      'AGENT_EDIT_TEXT_NOT_FOUND',
      `Edit ${position}: this text is not in the note: "${echo(oldText)}". Call getNote again and copy the text exactly as it appears, including Markdown punctuation. If an earlier edit in this call already changed it, target the new text instead.`
    ),
  editTextAmbiguous: (position: number, oldText: string, matches: number) =>
    make(
      'AGENT_EDIT_TEXT_AMBIGUOUS',
      `Edit ${position}: this text appears ${matches} times in the note: "${echo(oldText)}". Include more of the surrounding text so it matches exactly once.`
    ),
  wholeBodyUpdateRefused: (status: Exclude<NoteContentStatus, 'complete'>) =>
    make(
      'AGENT_WHOLE_BODY_UPDATE_REFUSED',
      status === 'truncated'
        ? 'You only received part of this note, so replacing its whole body would delete the rest. Use proposeEditNote to change the part you can see, or its appendMarkdown to add to the end.'
        : 'The content of this note was withheld from you, so its body cannot be replaced.'
    ),
} as const;
