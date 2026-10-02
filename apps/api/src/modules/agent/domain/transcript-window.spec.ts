import { describe, expect, it } from 'vitest';

import { MESSAGE_KIND, type MessageKind } from '@knowtis/shared-types';

import { alignTranscriptWindow } from './transcript-window';

interface Row {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly kind?: MessageKind;
}

const row = (role: Row['role'], content: string): Row => ({
  role,
  content,
});
const marker: Row = { role: 'user', content: '', kind: MESSAGE_KIND.CONTINUE };

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

  it.each([
    ['on a continue marker', [marker, row('assistant', 'continued answer')]],
    [
      'on the tail of a capped answer before its continue marker',
      [
        row('assistant', 'tail of a capped answer'),
        marker,
        row('assistant', 'continued answer'),
      ],
    ],
  ])(
    'should open a cut window that starts %s on the first question after it',
    (_start, orphaned) => {
      const rows = [
        ...orphaned,
        row('user', 'question'),
        row('assistant', 'answer'),
      ];

      expect(alignTranscriptWindow(rows, true)).toEqual({
        rows: [row('user', 'question'), row('assistant', 'answer')],
        hasEarlier: true,
      });
    }
  );

  it('should keep the continue markers that follow the first question of a cut window', () => {
    const rows = [
      row('assistant', 'tail of an older answer'),
      row('user', 'question'),
      row('assistant', 'capped answer'),
      marker,
      row('assistant', 'continued answer'),
    ];

    expect(alignTranscriptWindow(rows, true)).toEqual({
      rows: rows.slice(1),
      hasEarlier: true,
    });
  });

  it.each([
    [
      'on the tail of a capped answer',
      [
        row('assistant', 'tail of a capped answer'),
        marker,
        row('assistant', 'continued answer'),
        marker,
        row('assistant', 'continued again'),
      ],
    ],
    [
      'on a continue marker',
      [
        marker,
        row('assistant', 'continued answer'),
        marker,
        row('assistant', 'continued again'),
      ],
    ],
  ])(
    'should keep whole a cut window that starts %s and whose only questions are continue markers, so a long chain still shows its newest segments',
    (_start, rows) => {
      expect(alignTranscriptWindow(rows, true)).toEqual({
        rows,
        hasEarlier: true,
      });
    }
  );

  it('should keep a cut window with no question at all rather than show nothing', () => {
    const rows = [row('assistant', 'one'), row('assistant', 'two')];

    expect(alignTranscriptWindow(rows, true)).toEqual({
      rows,
      hasEarlier: true,
    });
  });
});
