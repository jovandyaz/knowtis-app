import { describe, expect, it } from 'vitest';

import { alignTranscriptWindow } from './transcript-window';

const row = (role: 'user' | 'assistant', content: string) => ({
  role,
  content,
});

describe('alignTranscriptWindow', () => {
  it('should return a window that reaches the first row as it is', () => {
    const rows = [row('assistant', 'hello'), row('user', 'hi')];

    expect(alignTranscriptWindow(rows, false)).toEqual({
      rows,
      hasEarlier: false,
    });
  });

  it('should drop the leading replies of a cut window up to the first question', () => {
    const rows = [
      row('assistant', 'tail of an older answer'),
      row('user', 'question'),
      row('assistant', 'answer'),
    ];

    expect(alignTranscriptWindow(rows, true)).toEqual({
      rows: [row('user', 'question'), row('assistant', 'answer')],
      hasEarlier: true,
    });
  });

  it('should keep a cut window that already starts on a question and still say earlier rows exist', () => {
    const rows = [row('user', 'question'), row('assistant', 'answer')];

    expect(alignTranscriptWindow(rows, true)).toEqual({
      rows,
      hasEarlier: true,
    });
  });

  it('should keep a cut window with no question at all rather than show nothing', () => {
    const rows = [row('assistant', 'one'), row('assistant', 'two')];

    expect(alignTranscriptWindow(rows, true)).toEqual({
      rows,
      hasEarlier: true,
    });
  });
});
