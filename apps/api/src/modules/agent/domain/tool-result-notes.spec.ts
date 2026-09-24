import { describe, expect, it } from 'vitest';

import type { AgentMessagePart, AgentRole } from './agent-message';
import type { ConversationMessageRow } from './ports/conversation.repository';
import {
  NOTE_UNAVAILABLE_OUTPUT,
  noteIdsInToolResults,
  redactUnreadableToolResults,
} from './tool-result-notes';

const call = (
  toolCallId: string,
  toolName: string,
  input: unknown
): AgentMessagePart => ({ type: 'tool-call', toolCallId, toolName, input });

const result = (
  toolCallId: string,
  toolName: string,
  output: unknown
): AgentMessagePart => ({
  type: 'tool-result',
  toolCallId,
  toolName,
  output,
  outputType: 'json',
});

const redacted = (toolCallId: string, toolName: string): AgentMessagePart => ({
  type: 'tool-result',
  toolCallId,
  toolName,
  output: NOTE_UNAVAILABLE_OUTPUT,
  outputType: 'json',
});

const row = (
  role: AgentRole,
  parts: AgentMessagePart[] | null,
  turnId: string
): ConversationMessageRow => ({
  role,
  content: '',
  sources: [],
  parts,
  stopReason: null,
  turnId,
});

const rowsOf = (
  calls: AgentMessagePart[],
  results: AgentMessagePart[],
  turnId = 't1'
): ConversationMessageRow[] => [
  row('user', null, turnId),
  row('assistant', calls, turnId),
  row('tool', results, turnId),
];

const note = (id: string) => ({ id, title: `title-${id}` });

describe('noteIdsInToolResults', () => {
  it('names the notes a result depends on through its call argument and its output, once each', () => {
    const rows = rowsOf(
      [
        call('c1', 'getNote', { noteId: 'a' }),
        call('c2', 'searchNotes', { query: 'q' }),
        call('c3', 'listRecentNotes', { limit: 5 }),
      ],
      [
        result('c1', 'getNote', { error: 'Note not found or not accessible.' }),
        result('c2', 'searchNotes', {
          hits: [note('b')],
          unindexed: [note('a')],
        }),
        result('c3', 'listRecentNotes', [note('c')]),
      ]
    );

    expect(noteIdsInToolResults(rows)).toEqual(['a', 'b', 'c']);
  });

  it('names every note in lowercase, however the id was written', () => {
    const rows = rowsOf(
      [call('c1', 'getNote', { noteId: 'ABC' })],
      [result('c1', 'getNote', { id: 'ABC', title: 'Upper' })]
    );

    expect(noteIdsInToolResults(rows)).toEqual(['abc']);
  });

  it('ignores a call whose result is not in the window', () => {
    const rows = rowsOf([call('c1', 'getNote', { noteId: 'a' })], []);

    expect(noteIdsInToolResults(rows)).toEqual([]);
  });
});

describe('redactUnreadableToolResults', () => {
  it('redacts a getNote result by the note its call asked for', () => {
    const rows = rowsOf(
      [call('c1', 'getNote', { noteId: 'a' })],
      [result('c1', 'getNote', { error: 'Note not found or not accessible.' })]
    );

    const redactedRows = redactUnreadableToolResults(rows, new Set());

    expect(redactedRows[1].parts).toEqual(rows[1].parts);
    expect(redactedRows[2].parts).toEqual([redacted('c1', 'getNote')]);
  });

  it('redacts a listing as soon as one of its notes is unreadable', () => {
    const rows = rowsOf(
      [call('c1', 'listRecentNotes', { limit: 5 })],
      [result('c1', 'listRecentNotes', [note('a'), note('b')])]
    );

    expect(redactUnreadableToolResults(rows, new Set(['a']))[2].parts).toEqual([
      redacted('c1', 'listRecentNotes'),
    ]);
    expect(
      redactUnreadableToolResults(rows, new Set(['a', 'b']))[2].parts
    ).toEqual(rows[2].parts);
  });

  it('leaves a result that names no note untouched', () => {
    const rows = rowsOf(
      [call('c1', 'getNotesOverview', {})],
      [result('c1', 'getNotesOverview', { total: 3, owned: 3 })]
    );

    expect(redactUnreadableToolResults(rows, new Set())).toEqual(rows);
  });

  it('matches note ids without regard to case', () => {
    const rows = rowsOf(
      [call('c1', 'getNote', { noteId: 'ABC' })],
      [result('c1', 'getNote', { id: 'ABC', title: 'Upper' })]
    );

    expect(redactUnreadableToolResults(rows, new Set(['abc']))).toEqual(rows);
    expect(redactUnreadableToolResults(rows, new Set(['ABC']))).toEqual(rows);
  });

  it('pairs a reused call id only with the call of its own turn', () => {
    const rows = [
      ...rowsOf(
        [call('tool_0', 'getNote', { noteId: 'lost' })],
        [result('tool_0', 'getNote', { error: 'gone' })],
        't1'
      ),
      ...rowsOf(
        [call('tool_0', 'listRecentNotes', { limit: 5 })],
        [result('tool_0', 'listRecentNotes', [note('kept')])],
        't3'
      ),
    ];

    const redactedRows = redactUnreadableToolResults(rows, new Set(['kept']));

    expect(redactedRows[2].parts).toEqual([redacted('tool_0', 'getNote')]);
    expect(redactedRows[5].parts).toEqual(rows[5].parts);
  });

  it('checks each result against every call of its turn that shares its id, so a collision over-redacts', () => {
    const rows = rowsOf(
      [
        call('dup', 'getNote', { noteId: 'lost' }),
        call('dup', 'getNote', { noteId: 'kept' }),
      ],
      [result('dup', 'getNote', note('kept'))]
    );

    expect(
      redactUnreadableToolResults(rows, new Set(['kept']))[2].parts
    ).toEqual([redacted('dup', 'getNote')]);
  });
});
