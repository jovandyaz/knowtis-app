import { describe, expect, it } from 'vitest';

import { notesSearchSchema } from './index';

describe('notesSearchSchema', () => {
  it('defaults view to all and drops a malformed bucket', () => {
    expect(notesSearchSchema.parse({ bucket: 'nope', view: 'junk' })).toEqual({
      view: 'all',
    });
  });

  it('defaults view to all when no search params are present', () => {
    expect(notesSearchSchema.parse({})).toEqual({ view: 'all' });
  });

  it('passes valid params through', () => {
    expect(
      notesSearchSchema.parse({ bucket: 'inbox', view: 'shared' })
    ).toEqual({
      bucket: 'inbox',
      view: 'shared',
    });
  });
});
