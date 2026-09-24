import { beforeEach, describe, expect, it } from 'vitest';

import type { ConversationTranscriptMessage } from '@knowtis/shared-types';

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
      { id: 'h1', role: 'user', content: 'Q' },
      {
        id: 'h2',
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
      { id: 'h1', role: 'user', content: 'Q' },
      {
        id: 'h2',
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
      { id: 'h1', role: 'user', content: 'Q' },
      {
        id: 'h2',
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
      { id: 'h1', role: 'user', content: 'Q' },
      { id: 'h2', role: 'assistant', content: 'Half', sources: [] },
    ]);
  });

  it('drops an assistant bubble left with nothing to show', () => {
    expect(
      toChatMessages(
        [
          row({ turnId: 't1', role: 'user', content: 'Q' }),
          row({
            turnId: 't1',
            role: 'assistant',
            content: '',
            stopReason: 'error',
          }),
        ],
        nextId
      )
    ).toEqual([{ id: 'h1', role: 'user', content: 'Q' }]);
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
});
