import { describe, expect, it } from 'vitest';

import type { AgentEvent } from '../domain/agent-event';
import { drainEvents } from './transcript';

async function* scripted(events: AgentEvent[]): AsyncIterable<AgentEvent> {
  for (const e of events) {
    yield e;
  }
}

const USAGE = {
  inputTokens: 10,
  outputTokens: 5,
  model: 'anthropic:claude-sonnet-4-20250514',
};

describe('drainEvents', () => {
  it('concatenates chunk text and captures sources on done', async () => {
    const t = await drainEvents(
      scripted([
        { type: 'chunk', text: 'Hello ' },
        { type: 'chunk', text: 'world' },
        {
          type: 'done',
          usage: USAGE,
          sources: [{ id: 'n1', title: 'Note 1' }],
          knownNotes: [],
          webSources: [],
          stopReason: 'completed',
        },
      ])
    );

    expect(t.text).toBe('Hello world');
    expect(t.sources).toEqual([{ id: 'n1', title: 'Note 1' }]);
    expect(t.proposal).toBeNull();
    expect(t.error).toBeNull();
  });

  it('returns an empty transcript when the stream yields no events', async () => {
    const t = await drainEvents(scripted([]));

    expect(t).toEqual({ text: '', proposal: null, sources: [], error: null });
  });

  it('captures a proposal kind and payload', async () => {
    const t = await drainEvents(
      scripted([
        {
          type: 'proposal',
          usage: USAGE,
          proposal: {
            id: 'p1',
            kind: 'update',
            summary: 'Rename',
            targetNoteId: 'n1',
            payload: { title: 'New title' },
          },
        },
      ])
    );

    expect(t.proposal).toEqual({
      kind: 'update',
      payload: { title: 'New title' },
    });
  });

  it('normalizes an error event', async () => {
    const t = await drainEvents(
      scripted([
        {
          type: 'error',
          error: { code: 'AI_PROVIDER_ERROR', message: 'boom' },
        },
      ])
    );

    expect(t.error).toEqual({ code: 'AI_PROVIDER_ERROR', message: 'boom' });
  });

  it('ignores committed and aborted events', async () => {
    const t = await drainEvents(
      scripted([
        { type: 'chunk', text: 'hi' },
        {
          type: 'committed',
          result: { noteId: 'n1', title: 'N1', kind: 'update' },
        },
        { type: 'aborted', usage: USAGE },
      ])
    );

    expect(t.text).toBe('hi');
    expect(t.proposal).toBeNull();
    expect(t.sources).toEqual([]);
    expect(t.error).toBeNull();
  });
});
