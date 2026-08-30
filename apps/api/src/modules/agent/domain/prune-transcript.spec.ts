import { describe, expect, it } from 'vitest';

import type { ConversationMessageRow } from './ports/conversation.repository';
import { partialReplySuffix, pruneTranscript } from './prune-transcript';

const row = (
  r: Partial<ConversationMessageRow> &
    Pick<ConversationMessageRow, 'role' | 'content'>
): ConversationMessageRow => ({
  sources: [],
  parts: null,
  stopReason: null,
  turnId: null,
  ...r,
});
const call = (id: string) => ({
  type: 'tool-call' as const,
  toolCallId: id,
  toolName: 'getNote',
  input: { id },
});
const result = (id: string) => ({
  type: 'tool-result' as const,
  toolCallId: id,
  toolName: 'getNote',
  output: 'body',
  outputType: 'text' as const,
});

function toolTurn(turnId: string, id: string): ConversationMessageRow[] {
  return [
    row({ role: 'user', content: `q-${turnId}`, turnId }),
    row({ role: 'assistant', content: '', parts: [call(id)], turnId }),
    row({ role: 'tool', content: '', parts: [result(id)], turnId }),
    row({
      role: 'assistant',
      content: `a-${turnId}`,
      stopReason: 'completed',
      turnId,
    }),
  ];
}

describe('pruneTranscript', () => {
  it('keeps tool activity only for the most recent N tool turns', () => {
    const rows = [
      ...toolTurn('t1', 'n1'),
      ...toolTurn('t2', 'n2'),
      ...toolTurn('t3', 'n3'),
    ];

    const out = pruneTranscript(rows, { keepToolTurns: 2 });

    expect(out.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'tool',
      'assistant',
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(out[1]).toEqual({ role: 'assistant', content: 'a-t1' });
    expect(out[3].parts).toEqual([call('n2')]);
  });

  it('strips everything to text when keepToolTurns is 0 (flag off)', () => {
    const out = pruneTranscript(toolTurn('t1', 'n1'), { keepToolTurns: 0 });
    expect(out).toEqual([
      { role: 'user', content: 'q-t1' },
      { role: 'assistant', content: 'a-t1' },
    ]);
  });

  it('passes legacy text rows through untouched', () => {
    const out = pruneTranscript(
      [
        row({ role: 'user', content: 'u' }),
        row({ role: 'assistant', content: 'a' }),
      ],
      { keepToolTurns: 2 }
    );
    expect(out).toEqual([
      { role: 'user', content: 'u' },
      { role: 'assistant', content: 'a' },
    ]);
  });

  it('removes a tool call without a result and a result without a call', () => {
    const rows = [
      row({ role: 'user', content: 'q', turnId: 't' }),
      row({
        role: 'assistant',
        content: 'x',
        parts: [{ type: 'text', text: 'x' }, call('n1'), call('n2')],
        turnId: 't',
      }),
      row({
        role: 'tool',
        content: '',
        parts: [result('n1'), result('n9')],
        turnId: 't',
      }),
      row({
        role: 'assistant',
        content: 'a',
        stopReason: 'completed',
        turnId: 't',
      }),
    ];

    const out = pruneTranscript(rows, { keepToolTurns: 2 });

    expect(out[1].parts).toEqual([{ type: 'text', text: 'x' }, call('n1')]);
    expect(out[2].parts).toEqual([result('n1')]);
  });

  it('drops a tool row left empty after orphan removal', () => {
    const rows = [
      row({ role: 'user', content: 'q', turnId: 't' }),
      row({ role: 'assistant', content: '', parts: [call('n1')], turnId: 't' }),
      row({ role: 'tool', content: '', parts: [result('n9')], turnId: 't' }),
      row({
        role: 'assistant',
        content: 'a',
        stopReason: 'completed',
        turnId: 't',
      }),
    ];
    expect(
      pruneTranscript(rows, { keepToolTurns: 2 }).map((m) => m.role)
    ).toEqual(['user', 'assistant']);
  });

  it.each(['aborted', 'error', 'length'] as const)(
    'marks a %s reply as cut off',
    (reason) => {
      const out = pruneTranscript(
        [
          row({ role: 'user', content: 'q' }),
          row({ role: 'assistant', content: 'half', stopReason: reason }),
        ],
        { keepToolTurns: 2 }
      );
      expect(out[1].content).toBe(`half\n\n[reply cut off: ${reason}]`);
    }
  );

  it('does not mark completed or capped replies', () => {
    const out = pruneTranscript(
      [row({ role: 'assistant', content: 'a', stopReason: 'max_steps' })],
      { keepToolTurns: 2 }
    );
    expect(out[0].content).toBe('a');
  });

  it('marks a cut-off reply on the parts of a kept row as well as its content', () => {
    const rows = [
      row({ role: 'user', content: 'q', turnId: 't' }),
      row({
        role: 'assistant',
        content: 'half',
        parts: [call('n1')],
        stopReason: 'aborted',
        turnId: 't',
      }),
      row({ role: 'tool', content: '', parts: [result('n1')], turnId: 't' }),
    ];

    const out = pruneTranscript(rows, { keepToolTurns: 2 });
    const suffix = partialReplySuffix('aborted');

    expect(out[1].content).toBe(`half${suffix}`);
    expect(out[1].parts?.at(-1)).toEqual({ type: 'text', text: suffix });
  });
  it('keeps a turn contiguous when a concurrent turn interleaves its rows', () => {
    const rows = [
      row({ role: 'user', content: 'q-t1', turnId: 't1' }),
      row({
        role: 'assistant',
        content: '',
        parts: [call('n1')],
        turnId: 't1',
      }),
      row({ role: 'user', content: 'q-t2', turnId: 't2' }),
      row({ role: 'tool', content: '', parts: [result('n1')], turnId: 't1' }),
      row({
        role: 'assistant',
        content: 'a-t1',
        stopReason: 'completed',
        turnId: 't1',
      }),
    ];

    const out = pruneTranscript(rows, { keepToolTurns: 2 });

    expect(out.map((m) => [m.role, m.content])).toEqual([
      ['user', 'q-t1'],
      ['assistant', ''],
      ['tool', ''],
      ['assistant', 'a-t1'],
      ['user', 'q-t2'],
    ]);
    expect(out[1].parts).toEqual([call('n1')]);
    expect(out[2].parts).toEqual([result('n1')]);
  });

  it('keeps interleaved rows without a turn id in their original order', () => {
    const rows = [
      row({ role: 'user', content: 'legacy-q' }),
      row({ role: 'user', content: 'q-t1', turnId: 't1' }),
      row({
        role: 'assistant',
        content: '',
        parts: [call('n1')],
        turnId: 't1',
      }),
      row({ role: 'assistant', content: 'legacy-a' }),
      row({ role: 'tool', content: '', parts: [result('n1')], turnId: 't1' }),
      row({
        role: 'assistant',
        content: 'a-t1',
        stopReason: 'completed',
        turnId: 't1',
      }),
    ];

    const out = pruneTranscript(rows, { keepToolTurns: 2 });

    expect(out.map((m) => [m.role, m.content])).toEqual([
      ['user', 'legacy-q'],
      ['user', 'q-t1'],
      ['assistant', ''],
      ['tool', ''],
      ['assistant', 'a-t1'],
      ['assistant', 'legacy-a'],
    ]);
  });
});
