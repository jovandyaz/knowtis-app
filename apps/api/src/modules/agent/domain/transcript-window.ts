const QUESTION_ROLE = 'user';

export function alignTranscriptWindow<T extends { readonly role: string }>(
  rows: readonly T[],
  cut: boolean
): { rows: T[]; hasEarlier: boolean } {
  if (!cut) {
    return { rows: [...rows], hasEarlier: false };
  }
  const firstQuestion = rows.findIndex((row) => row.role === QUESTION_ROLE);
  return { rows: rows.slice(Math.max(firstQuestion, 0)), hasEarlier: true };
}
