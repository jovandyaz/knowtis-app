import { MESSAGE_KIND } from '@knowtis/shared-types';

import type { ConversationMessageRow } from './ports/conversation.repository';

/** How many continue markers follow the newest user message that is not one: 0 for a plain turn, 1 for its first continuation. */
export function segmentIndexOf(
  rows: readonly ConversationMessageRow[]
): number {
  let markers = 0;
  for (const row of rows.toReversed()) {
    if (row.role !== 'user') {
      continue;
    }
    if (row.kind !== MESSAGE_KIND.CONTINUE) {
      return markers;
    }
    markers += 1;
  }
  return markers;
}
