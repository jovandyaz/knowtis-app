import { describe, expect, it } from 'vitest';

import type { AgentChatMessage } from './agent.store';
import { mergeTranscript } from './merge-transcript';

function user(id: string, turnId?: string): AgentChatMessage {
  return { id, ...(turnId ? { turnId } : {}), role: 'user', content: id };
}

function assistant(
  id: string,
  turnId?: string,
  extra: Partial<AgentChatMessage> = {}
): AgentChatMessage {
  return {
    id,
    ...(turnId ? { turnId } : {}),
    role: 'assistant',
    content: id,
    ...extra,
  };
}

interface MergeCase {
  transcript: AgentChatMessage[];
  live: AgentChatMessage[];
  streamingTurnId?: string;
  shown: string[];
}

const cases: Record<string, MergeCase> = {
  'shows a turn persisted since it was sent once, as the transcript has it': {
    transcript: [
      user('h-q1', 't1'),
      assistant('h-a1', 't1'),
      user('h-q2', 't2'),
      assistant('h-a2', 't2'),
    ],
    live: [user('l-q2', 't2'), assistant('l-a2', 't2')],
    shown: ['h-q1', 'h-a1', 'h-q2', 'h-a2'],
  },
  "replaces every live bubble of a turn resumed after a proposal with the transcript's legs":
    {
      transcript: [
        user('h-q1', 't1'),
        assistant('h-before', 't1'),
        assistant('h-after', 't1'),
      ],
      live: [
        user('l-q1', 't1'),
        assistant('l-before', 't1', {
          proposal: { kind: 'create' },
          committed: { kind: 'create', title: 'Trip' },
        }),
        assistant('l-after', 't1'),
      ],
      shown: ['h-q1', 'h-before', 'h-after'],
    },
  'takes the resumed leg from the transcript when the live turn never showed it':
    {
      transcript: [
        user('h-q1', 't1'),
        assistant('h-before', 't1'),
        assistant('h-after', 't1'),
      ],
      live: [user('l-q1', 't1'), assistant('l-before', 't1')],
      shown: ['h-q1', 'h-before', 'h-after'],
    },
  'keeps the live bubbles of the turn still streaming, after the transcript': {
    transcript: [
      user('h-q1', 't1'),
      assistant('h-a1', 't1'),
      user('h-q2', 't2'),
      assistant('h-partial', 't2'),
    ],
    live: [user('l-q2', 't2'), assistant('l-growing', 't2')],
    streamingTurnId: 't2',
    shown: ['h-q1', 'h-a1', 'l-q2', 'l-growing'],
  },
  'keeps the live bubbles of a streaming turn the transcript does not have yet':
    {
      transcript: [user('h-q1', 't1'), assistant('h-a1', 't1')],
      live: [user('l-q2', 't2'), assistant('l-a2', 't2')],
      streamingTurnId: 't2',
      shown: ['h-q1', 'h-a1', 'l-q2', 'l-a2'],
    },
  'appends the live turns the transcript lacks, in the order they were sent': {
    transcript: [user('h-q1', 't1'), assistant('h-a1', 't1')],
    live: [
      user('l-q3', 't3'),
      assistant('l-a3', 't3'),
      user('l-q4', 't4'),
      assistant('l-a4', 't4'),
    ],
    shown: ['h-q1', 'h-a1', 'l-q3', 'l-a3', 'l-q4', 'l-a4'],
  },
  'keeps every live turn when the transcript is empty': {
    transcript: [],
    live: [user('l-q1', 't1'), assistant('l-a1', 't1')],
    shown: ['l-q1', 'l-a1'],
  },
  'keeps legacy history without a turn id where the transcript has it': {
    transcript: [
      user('h-legacy-q'),
      assistant('h-legacy-a'),
      user('h-q1', 't1'),
      assistant('h-a1', 't1'),
    ],
    live: [user('l-q2', 't2'), assistant('l-a2', 't2')],
    shown: ['h-legacy-q', 'h-legacy-a', 'h-q1', 'h-a1', 'l-q2', 'l-a2'],
  },
  'drops the legacy bubbles an earlier transcript left, so a refetch does not repeat them':
    {
      transcript: [
        user('h2-legacy-q'),
        assistant('h2-legacy-a'),
        user('h2-q1', 't1'),
        assistant('h2-a1', 't1'),
      ],
      live: [
        user('h1-legacy-q'),
        assistant('h1-legacy-a'),
        user('h1-q1', 't1'),
        assistant('h1-a1', 't1'),
        user('l-q2', 't2'),
        assistant('l-a2', 't2'),
      ],
      shown: ['h2-legacy-q', 'h2-legacy-a', 'h2-q1', 'h2-a1', 'l-q2', 'l-a2'],
    },
  'drops the legacy bubbles an earlier transcript left once the window no longer reaches them':
    {
      transcript: [user('h2-q1', 't1'), assistant('h2-a1', 't1')],
      live: [
        user('h1-legacy-q'),
        assistant('h1-legacy-a'),
        user('h1-q1', 't1'),
        assistant('h1-a1', 't1'),
      ],
      shown: ['h2-q1', 'h2-a1'],
    },
};

describe('mergeTranscript', () => {
  it.each(Object.entries(cases))(
    '%s',
    (_name, { transcript, live, streamingTurnId, shown }) => {
      expect(
        mergeTranscript(transcript, live, streamingTurnId).map(
          (message) => message.id
        )
      ).toEqual(shown);
    }
  );

  it('keeps the live messages themselves, markers included, for the streaming turn', () => {
    const streaming = assistant('l-a1', 't1', {
      proposal: { kind: 'update' },
    });

    expect(
      mergeTranscript(
        [user('h-q1', 't1'), assistant('h-a1', 't1')],
        [user('l-q1', 't1'), streaming],
        't1'
      ).at(-1)
    ).toBe(streaming);
  });
});
