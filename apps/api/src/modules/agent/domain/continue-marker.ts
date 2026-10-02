import { MESSAGE_KIND, type MessageKind } from '@knowtis/shared-types';

export interface MarkableRow {
  readonly role: string;
  readonly kind?: MessageKind | null;
}

/** Whether a stored row is the user row a continuation writes in place of a message. */
export function isContinueMarker(row: MarkableRow): boolean {
  return row.role === 'user' && row.kind === MESSAGE_KIND.CONTINUE;
}
