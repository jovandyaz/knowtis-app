export const NOTE_EXPOSURE = {
  foreign: 'foreign',
  editableByOthers: 'editable_by_others',
  missing: 'missing',
} as const;

/** How a note may carry words the user did not write. */
export type NoteExposure = (typeof NOTE_EXPOSURE)[keyof typeof NOTE_EXPOSURE];

export interface NoteExposureRepository {
  /**
   * The exposure of each of `noteIds`, read in a single query and keyed by lowercased id: `foreign`
   * when another user owns the note, `editable_by_others` when `userId` owns it but an editor
   * permission granted to another user, or a link whose role is editor, lets someone else write it,
   * and `missing` when no note has that id (an id that is not a uuid included). Notes `userId` owns
   * that nobody else can edit are left out.
   */
  findExposures(
    userId: string,
    noteIds: readonly string[]
  ): Promise<ReadonlyMap<string, NoteExposure>>;
}

export const NOTE_EXPOSURE_REPOSITORY = Symbol('NOTE_EXPOSURE_REPOSITORY');
