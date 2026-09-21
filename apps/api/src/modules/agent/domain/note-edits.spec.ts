import { describe, expect, it } from 'vitest';

import { applyNoteEdits } from './note-edits';

describe('applyNoteEdits', () => {
  it('applies a single edit in place', () => {
    const r = applyNoteEdits('Buy milk and eggs.', [
      { oldText: 'milk', newText: 'oat milk' },
    ]);

    expect(r._unsafeUnwrap()).toBe('Buy oat milk and eggs.');
  });

  it('returns the document untouched when there are no edits', () => {
    expect(applyNoteEdits('## Plan', [])._unsafeUnwrap()).toBe('## Plan');
  });

  it('applies each edit against the result of the previous one', () => {
    const r = applyNoteEdits('alpha', [
      { oldText: 'alpha', newText: 'beta' },
      { oldText: 'beta', newText: 'gamma' },
    ]);

    expect(r._unsafeUnwrap()).toBe('gamma');
  });

  it('reports not_found for an edit whose target an earlier edit consumed', () => {
    const r = applyNoteEdits('hello world', [
      { oldText: 'hello', newText: 'hi' },
      { oldText: 'hello', newText: 'hey' },
    ]);

    expect(r._unsafeUnwrapErr()).toStrictEqual({
      kind: 'not_found',
      index: 1,
      oldText: 'hello',
      matches: 0,
    });
  });

  it('refuses an ambiguous target rather than guessing which one to change', () => {
    const r = applyNoteEdits('draft draft', [
      { oldText: 'draft', newText: 'final' },
    ]);

    expect(r._unsafeUnwrapErr()).toStrictEqual({
      kind: 'ambiguous',
      index: 0,
      oldText: 'draft',
      matches: 2,
    });
  });

  it('keeps earlier edits out of the result when a later one is ambiguous', () => {
    const r = applyNoteEdits('unique twice twice', [
      { oldText: 'unique', newText: 'changed' },
      { oldText: 'twice', newText: 'once' },
    ]);

    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().index).toBe(1);
  });

  it('inserts replacement patterns literally instead of expanding them', () => {
    const r = applyNoteEdits('Escape the PLACEHOLDER here.', [
      { oldText: 'PLACEHOLDER', newText: '$& and $1 and $$' },
    ]);

    expect(r._unsafeUnwrap()).toBe('Escape the $& and $1 and $$ here.');
  });

  it('matches a CRLF target against an LF document', () => {
    const r = applyNoteEdits('line one\nline two', [
      { oldText: 'line one\r\nline two', newText: 'done' },
    ]);

    expect(r._unsafeUnwrap()).toBe('done');
  });

  it('normalises the document and the replacement to LF', () => {
    const r = applyNoteEdits('head\r\nkeep\rtail', [
      { oldText: 'head', newText: 'top\r\nnew' },
    ]);

    expect(r._unsafeUnwrap()).toBe('top\nnew\nkeep\ntail');
  });

  it('treats a target that differs only by a trailing space as absent', () => {
    const r = applyNoteEdits('todo', [{ oldText: 'todo ', newText: 'done' }]);

    expect(r._unsafeUnwrapErr()).toStrictEqual({
      kind: 'not_found',
      index: 0,
      oldText: 'todo ',
      matches: 0,
    });
  });

  it('counts overlapping occurrences as one non-overlapping match', () => {
    const r = applyNoteEdits('aaa', [{ oldText: 'aa', newText: 'b' }]);

    expect(r._unsafeUnwrap()).toBe('ba');
  });

  it('deletes the target when the replacement is empty', () => {
    const r = applyNoteEdits('keep drop', [{ oldText: ' drop', newText: '' }]);

    expect(r._unsafeUnwrap()).toBe('keep');
  });

  it('reports not_found for an empty target instead of matching everywhere', () => {
    const r = applyNoteEdits('anything', [{ oldText: '', newText: 'x' }]);

    expect(r._unsafeUnwrapErr()).toStrictEqual({
      kind: 'not_found',
      index: 0,
      oldText: '',
      matches: 0,
    });
  });
});
