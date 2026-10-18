import { beforeEach, describe, expect, it } from 'vitest';

import type {
  ConversationTranscriptMessage,
  MessageKind,
} from '@knowtis/shared-types';

import { toChatMessages } from './conversation-transcript';

const N1 = { id: 'n1', title: 'N1' };

function row(
  over: Partial<ConversationTranscriptMessage> &
    Pick<ConversationTranscriptMessage, 'role' | 'content'>
): ConversationTranscriptMessage {
  return { turnId: null, sources: [], stopReason: null, ...over };
}

let counter = 0;
const nextId = () => `h${++counter}`;

describe('toChatMessages', () => {
  beforeEach(() => {
    counter = 0;
  });

  it('merges the step rows of one turn into one bubble, the way it streamed', () => {
    expect(
      toChatMessages(
        [
          row({ turnId: 't1', role: 'user', content: 'Q' }),
          row({ turnId: 't1', role: 'assistant', content: 'Let me look. ' }),
          row({
            turnId: 't1',
            role: 'assistant',
            content: 'Found it.',
            sources: [N1],
            stopReason: 'completed',
          }),
        ],
        nextId
      )
    ).toEqual([
      { id: 'h1', turnId: 't1', role: 'user', content: 'Q' },
      {
        id: 'h2',
        turnId: 't1',
        role: 'assistant',
        content: 'Let me look. Found it.',
        sources: [N1],
        stopReason: 'completed',
      },
    ]);
  });

  it('keeps the stop notice of a turn whose last row has no text', () => {
    expect(
      toChatMessages(
        [
          row({ turnId: 't1', role: 'user', content: 'Q' }),
          row({ turnId: 't1', role: 'assistant', content: 'Partial' }),
          row({
            turnId: 't1',
            role: 'assistant',
            content: '',
            sources: [N1],
            stopReason: 'max_steps',
          }),
        ],
        nextId
      )
    ).toEqual([
      { id: 'h1', turnId: 't1', role: 'user', content: 'Q' },
      {
        id: 'h2',
        turnId: 't1',
        role: 'assistant',
        content: 'Partial',
        sources: [N1],
        stopReason: 'max_steps',
      },
    ]);
  });

  it('shows a turn that ended without any text by its notice alone', () => {
    expect(
      toChatMessages(
        [
          row({ turnId: 't1', role: 'user', content: 'Q' }),
          row({
            turnId: 't1',
            role: 'assistant',
            content: '',
            stopReason: 'token_budget',
          }),
        ],
        nextId
      )
    ).toEqual([
      { id: 'h1', turnId: 't1', role: 'user', content: 'Q' },
      {
        id: 'h2',
        turnId: 't1',
        role: 'assistant',
        content: '',
        sources: [],
        stopReason: 'token_budget',
      },
    ]);
  });

  it('drops the stop reasons the live dock never shows', () => {
    expect(
      toChatMessages(
        [
          row({ turnId: 't1', role: 'user', content: 'Q' }),
          row({
            turnId: 't1',
            role: 'assistant',
            content: 'Half',
            stopReason: 'aborted',
          }),
        ],
        nextId
      )
    ).toEqual([
      { id: 'h1', turnId: 't1', role: 'user', content: 'Q' },
      {
        id: 'h2',
        turnId: 't1',
        role: 'assistant',
        content: 'Half',
        sources: [],
        interrupted: true,
      },
    ]);
  });

  it.each(['aborted', 'error'] as const)(
    'marks the bubble of a leg stored as %s as interrupted',
    (stopReason) => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Q' }),
            row({ turnId: 't1', role: 'assistant', content: 'Looking. ' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: 'Hal',
              stopReason,
            }),
          ],
          nextId
        ).at(-1)
      ).toMatchObject({ content: 'Looking. Hal', interrupted: true });
    }
  );

  it('does not mark a leg that completed as interrupted', () => {
    expect(
      toChatMessages(
        [
          row({ turnId: 't1', role: 'user', content: 'Q' }),
          row({
            turnId: 't1',
            role: 'assistant',
            content: 'A',
            stopReason: 'completed',
          }),
        ],
        nextId
      ).at(-1)
    ).not.toHaveProperty('interrupted');
  });

  it.each(['aborted', 'error'] as const)(
    'renders nothing for an empty interrupted assistant row stored as %s',
    (stopReason) => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Q' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: '',
              stopReason,
            }),
          ],
          nextId
        )
      ).toEqual([{ id: 'h1', turnId: 't1', role: 'user', content: 'Q' }]);
    }
  );

  it('leaves history written before turns had ids without a turn id', () => {
    expect(
      toChatMessages(
        [
          row({ role: 'user', content: 'Q' }),
          row({ role: 'assistant', content: 'A' }),
        ],
        nextId
      )
    ).toEqual([
      { id: 'h1', role: 'user', content: 'Q' },
      { id: 'h2', role: 'assistant', content: 'A', sources: [] },
    ]);
  });

  it('never merges history written before turns had ids', () => {
    expect(
      toChatMessages(
        [
          row({ role: 'assistant', content: 'A' }),
          row({ role: 'assistant', content: 'B' }),
        ],
        nextId
      ).map((message) => message.content)
    ).toEqual(['A', 'B']);
  });

  it('keeps separate turns separate', () => {
    expect(
      toChatMessages(
        [
          row({ turnId: 't1', role: 'user', content: 'Q1' }),
          row({ turnId: 't1', role: 'assistant', content: 'A1' }),
          row({ turnId: 't2', role: 'user', content: 'Q2' }),
          row({ turnId: 't2', role: 'assistant', content: 'A2' }),
        ],
        nextId
      ).map((message) => message.content)
    ).toEqual(['Q1', 'A1', 'Q2', 'A2']);
  });

  it.each([
    {
      shape: 'a plain turn',
      rows: [
        row({ turnId: 't1', role: 'user', content: 'Q' }),
        row({
          turnId: 't1',
          role: 'assistant',
          content: 'A',
          stopReason: 'completed',
        }),
      ],
      bubbles: ['Q', 'A'],
    },
    {
      shape:
        'a turn resumed after a proposal, one bubble per leg as it streamed',
      rows: [
        row({ turnId: 't1', role: 'user', content: 'Create a note' }),
        row({
          turnId: 't1',
          role: 'assistant',
          content: 'I will create the note.',
          stopReason: 'completed',
        }),
        row({
          turnId: 't1',
          role: 'assistant',
          content: 'Done, I created it.',
          stopReason: 'completed',
        }),
      ],
      bubbles: [
        'Create a note',
        'I will create the note.',
        'Done, I created it.',
      ],
    },
    {
      shape: 'a multi-step turn, all its steps in one bubble',
      rows: [
        row({ turnId: 't1', role: 'user', content: 'Q' }),
        row({ turnId: 't1', role: 'assistant', content: 'Looking. ' }),
        row({ turnId: 't1', role: 'assistant', content: 'Still looking. ' }),
        row({
          turnId: 't1',
          role: 'assistant',
          content: 'Found it.',
          stopReason: 'completed',
        }),
      ],
      bubbles: ['Q', 'Looking. Still looking. Found it.'],
    },
  ])('renders $shape', ({ rows, bubbles }) => {
    expect(
      toChatMessages(rows, nextId).map((message) => message.content)
    ).toEqual(bubbles);
  });

  it('keeps a continue marker as a user row with no text', () => {
    expect(
      toChatMessages(
        [
          row({ turnId: 't1', role: 'user', content: 'Q' }),
          row({
            turnId: 't1',
            role: 'assistant',
            content: 'Part one.',
            stopReason: 'max_steps',
          }),
          row({ turnId: 't2', role: 'user', content: '', kind: 'continue' }),
          row({
            turnId: 't2',
            role: 'assistant',
            content: 'Part two.',
            stopReason: 'completed',
          }),
        ],
        nextId
      )
    ).toEqual([
      { id: 'h1', turnId: 't1', role: 'user', content: 'Q' },
      {
        id: 'h2',
        turnId: 't1',
        role: 'assistant',
        content: 'Part one.',
        sources: [],
        stopReason: 'max_steps',
      },
      { id: 'h3', turnId: 't2', role: 'user', content: '', kind: 'continue' },
      {
        id: 'h4',
        turnId: 't2',
        role: 'assistant',
        content: 'Part two.',
        sources: [],
        stopReason: 'completed',
      },
    ]);
  });

  it('drops a kind this build does not know, leaving a plain user row', () => {
    const fromNewerServer = 'something_new' as unknown as MessageKind;

    expect(
      toChatMessages(
        [
          row({
            turnId: 't1',
            role: 'user',
            content: 'Q',
            kind: fromNewerServer,
          }),
        ],
        nextId
      )
    ).toStrictEqual([{ id: 'h1', turnId: 't1', role: 'user', content: 'Q' }]);
  });

  describe('the memories a stored reply used', () => {
    it('carries them by id from the terminal row of the leg', () => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Q' }),
            row({ turnId: 't1', role: 'assistant', content: 'Let me look. ' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: 'Found it.',
              stopReason: 'completed',
              usedMemoryIds: ['mem-1', 'mem-2'],
            }),
          ],
          nextId
        ).at(-1)
      ).toEqual({
        id: 'h2',
        turnId: 't1',
        role: 'assistant',
        content: 'Let me look. Found it.',
        sources: [],
        stopReason: 'completed',
        usedMemories: [{ id: 'mem-1' }, { id: 'mem-2' }],
      });
    });

    it('keeps them on a leg stored as interrupted', () => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Q' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: 'Hal',
              stopReason: 'error',
              usedMemoryIds: ['mem-1'],
            }),
          ],
          nextId
        ).at(-1)
      ).toMatchObject({ interrupted: true, usedMemories: [{ id: 'mem-1' }] });
    });

    it('gives each leg of a decided turn the memories its own prompt received', () => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Create it' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: 'Proposed.',
              stopReason: 'completed',
              usedMemoryIds: ['mem-1'],
            }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: 'Created.',
              stopReason: 'completed',
              usedMemoryIds: ['mem-2'],
            }),
          ],
          nextId
        ).map((message) => message.usedMemories)
      ).toEqual([undefined, [{ id: 'mem-1' }], [{ id: 'mem-2' }]]);
    });

    it('moves the memories of a hidden empty leg onto the next answer of its turn, once each and in order', () => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Create it' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: '',
              stopReason: 'completed',
              usedMemoryIds: ['mem-1', 'mem-2'],
            }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: 'Created.',
              stopReason: 'completed',
              usedMemoryIds: ['mem-2', 'mem-3'],
            }),
          ],
          nextId
        )
      ).toEqual([
        { id: 'h1', turnId: 't1', role: 'user', content: 'Create it' },
        {
          id: 'h3',
          turnId: 't1',
          role: 'assistant',
          content: 'Created.',
          sources: [],
          stopReason: 'completed',
          usedMemories: [{ id: 'mem-1' }, { id: 'mem-2' }, { id: 'mem-3' }],
        },
      ]);
    });

    it('gives them to the next answer of the turn even when that answer used none itself', () => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Create it' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: '',
              stopReason: 'completed',
              usedMemoryIds: ['mem-1'],
            }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: 'Created.',
              stopReason: 'completed',
            }),
          ],
          nextId
        ).at(-1)
      ).toMatchObject({ content: 'Created.', usedMemories: [{ id: 'mem-1' }] });
    });

    it('drops the memories of a hidden empty leg when no answer of its turn follows', () => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Create it' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: '',
              stopReason: 'completed',
              usedMemoryIds: ['mem-1'],
            }),
            row({ turnId: 't2', role: 'user', content: 'Q2' }),
            row({
              turnId: 't2',
              role: 'assistant',
              content: 'A2',
              stopReason: 'completed',
            }),
          ],
          nextId
        ).map((message) => message.usedMemories)
      ).toEqual([undefined, undefined, undefined]);
    });

    it('never moves them onto an answer of another turn', () => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Create it' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: '',
              stopReason: 'completed',
              usedMemoryIds: ['mem-1'],
            }),
            row({
              turnId: 't2',
              role: 'assistant',
              content: 'A2',
              stopReason: 'completed',
            }),
          ],
          nextId
        ).map((message) => message.usedMemories)
      ).toEqual([undefined, undefined]);
    });

    it.each([
      ['an empty list', { usedMemoryIds: [] }],
      ['no list', {}],
    ])('leaves a reply stored with %s without them', (_case, over) => {
      expect(
        toChatMessages(
          [
            row({ turnId: 't1', role: 'user', content: 'Q' }),
            row({
              turnId: 't1',
              role: 'assistant',
              content: 'A',
              stopReason: 'completed',
              ...over,
            }),
          ],
          nextId
        ).at(-1)
      ).not.toHaveProperty('usedMemories');
    });
  });
});
