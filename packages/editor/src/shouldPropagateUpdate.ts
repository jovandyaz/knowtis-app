/**
 * Predicate that decides whether a Tiptap `onUpdate` callback should be
 * forwarded to the parent autosave.
 *
 * Two gates stacked in order:
 * 1. `isInitializing`: we're mid-`setContent` while seeding the Y.Doc.
 *    Forwarding here would echo initialContent back as an "edit".
 * 2. `isSynced`: the Yjs provider has not yet applied the server-initial
 *    state. Any `onUpdate` fired during this window reflects a transient
 *    empty Y.Doc, not the user's content. Forwarding would destroy the
 *    persisted note.
 */
export function shouldPropagateUpdate(opts: {
  isInitializing: boolean;
  isSynced: boolean;
}): boolean {
  return !opts.isInitializing && opts.isSynced;
}
