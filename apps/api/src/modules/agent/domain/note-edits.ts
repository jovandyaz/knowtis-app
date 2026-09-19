import { err, ok, type Result } from 'neverthrow';

export interface NoteEdit {
  readonly oldText: string;
  readonly newText: string;
}

export const NOTE_EDIT_FAILURES = ['not_found', 'ambiguous'] as const;
export type NoteEditFailureKind = (typeof NOTE_EDIT_FAILURES)[number];

export interface NoteEditFailure {
  readonly kind: NoteEditFailureKind;
  /** Zero-based position in the edits array. */
  readonly index: number;
  /** The text that was searched for, with line endings normalised. */
  readonly oldText: string;
  /** Occurrences found; 0 for not_found. */
  readonly matches: number;
}

const LINE_ENDINGS = /\r\n|\r/g;

function toLineFeeds(text: string): string {
  return text.replace(LINE_ENDINGS, '\n');
}

function countOccurrences(document: string, target: string): number {
  let count = 0;
  let at = document.indexOf(target);
  while (at !== -1) {
    count += 1;
    at = document.indexOf(target, at + target.length);
  }
  return count;
}

/** Applies the edits in order, each against the result of the previous one. Line endings are normalised to \n on both sides; nothing else is — matching is exact by design. */
export function applyNoteEdits(
  markdown: string,
  edits: readonly NoteEdit[]
): Result<string, NoteEditFailure> {
  let document = toLineFeeds(markdown);
  for (const [index, edit] of edits.entries()) {
    const oldText = toLineFeeds(edit.oldText);
    const matches = oldText === '' ? 0 : countOccurrences(document, oldText);
    if (matches !== 1) {
      return err({
        kind: matches === 0 ? 'not_found' : 'ambiguous',
        index,
        oldText,
        matches,
      });
    }
    const at = document.indexOf(oldText);
    document = `${document.slice(0, at)}${toLineFeeds(edit.newText)}${document.slice(at + oldText.length)}`;
  }
  return ok(document);
}
