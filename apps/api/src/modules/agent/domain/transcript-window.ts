import { isContinueMarker, type MarkableRow } from './continue-marker';

const QUESTION_ROLE = 'user';

function isQuestion(row: MarkableRow): boolean {
  return row.role === QUESTION_ROLE && !isContinueMarker(row);
}

/** A window cut mid-conversation from its first question on, so it never opens on a reply or on a continue marker whose capped turn was cut off: empty when every user row in it is a marker, whole when it has no user row. */
export function alignToFirstQuestion<T extends MarkableRow>(
  rows: readonly T[]
): T[] {
  const firstQuestion = rows.findIndex(isQuestion);
  if (firstQuestion >= 0) {
    return rows.slice(firstQuestion);
  }
  return rows.some(isContinueMarker) ? [] : [...rows];
}

export function alignTranscriptWindow<T extends MarkableRow>(
  rows: readonly T[],
  cut: boolean
): { rows: T[]; hasEarlier: boolean } {
  return cut
    ? { rows: alignToFirstQuestion(rows), hasEarlier: true }
    : { rows: [...rows], hasEarlier: false };
}
