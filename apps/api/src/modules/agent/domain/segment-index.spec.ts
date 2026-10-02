import { describe, expect, it } from 'vitest';

import type { ConversationMessageRow } from './ports/conversation.repository';
import { segmentIndexOf } from './segment-index';

const row = (
  r: Partial<ConversationMessageRow> &
    Pick<ConversationMessageRow, 'role' | 'content'>
): ConversationMessageRow => ({
  sources: [],
  parts: null,
  stopReason: null,
  turnId: null,
  kind: null,
  model: null,
  ...r,
});
const user = row({ role: 'user', content: 'research X' });
const reply = row({
  role: 'assistant',
  content: 'Found A.',
  stopReason: 'max_steps',
});
const tool = row({ role: 'tool', content: '' });
const marker = row({ role: 'user', content: '', kind: 'continue' });

describe('segmentIndexOf', () => {
  it.each([
    ['an empty conversation', [], 0],
    ['a plain history', [user, reply, user, tool, reply], 0],
    ['a first continuation', [user, reply, marker, reply], 1],
    ['a second continuation', [user, reply, marker, reply, marker, reply], 2],
    [
      'a new message after a continuation',
      [user, reply, marker, reply, user, reply],
      0,
    ],
    [
      'a continuation whose reply used tools',
      [user, reply, marker, tool, reply],
      1,
    ],
    [
      'a continue kind on an assistant row',
      [user, row({ role: 'assistant', content: '', kind: 'continue' })],
      0,
    ],
  ] as const)('counts %s as %i', (_label, rows, expected) => {
    expect(segmentIndexOf(rows)).toBe(expected);
  });
});
