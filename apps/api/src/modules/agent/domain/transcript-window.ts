import { isContinueMarker, type MarkableRow } from './continue-marker';

const QUESTION_ROLE = 'user';

function isQuestion(row: MarkableRow): boolean {
  return row.role === QUESTION_ROLE && !isContinueMarker(row);
}

/** A window cut mid-conversation from its first question on, so it never opens on a reply or on a continue marker whose capped turn was cut off; a window with no question, such as the newest segments of a long continuation chain, is kept whole. */
export function alignToFirstQuestion<T extends MarkableRow>(
  rows: readonly T[]
): T[] {
  const firstQuestion = rows.findIndex(isQuestion);
  return firstQuestion >= 0 ? rows.slice(firstQuestion) : [...rows];
}

export function alignTranscriptWindow<T extends MarkableRow>(
  rows: readonly T[],
  cut: boolean
): { rows: T[]; hasEarlier: boolean } {
  return cut
    ? { rows: alignToFirstQuestion(rows), hasEarlier: true }
    : { rows: [...rows], hasEarlier: false };
}
