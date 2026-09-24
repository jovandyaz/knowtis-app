import { v5 as uuidv5 } from 'uuid';

/** Namespace of the conversation ids derived from a turn. Never change it: every derived id would move. */
export const KNOWTIS_CONVERSATION_NAMESPACE =
  '694f20fb-3ec2-4549-bd30-01660a856905';

/** The id of the conversation a turn opens when it names none, so a resend of that turn lands in the same conversation. */
export function conversationIdForTurn(userId: string, turnId: string): string {
  return uuidv5(`${userId}:${turnId}`, KNOWTIS_CONVERSATION_NAMESPACE);
}
