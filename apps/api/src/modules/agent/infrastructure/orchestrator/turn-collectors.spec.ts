import type { ToolSet, TypedToolResult } from 'ai';
import { describe, expect, it } from 'vitest';

import type { AgentSource } from '../../domain/agent-event';
import { collectKnownNotes, collectSources } from './turn-collectors';

const note = (id: string) => ({ id, title: `title-${id}` });

function result(toolName: string, output: unknown): TypedToolResult<ToolSet> {
  return { toolName, output } as unknown as TypedToolResult<ToolSet>;
}

function known(...results: TypedToolResult<ToolSet>[]): string[] {
  const sink = new Map<string, AgentSource>();
  collectKnownNotes(results, sink);
  return [...sink.keys()];
}

describe('collectKnownNotes', () => {
  it('reads the notes out of a searchNotes result', () => {
    expect(
      known(result('searchNotes', { hits: [note('a'), note('b')] }))
    ).toEqual(['a', 'b']);
  });

  it('treats notes pending indexing as known, so the model can open them by id', () => {
    expect(
      known(result('searchNotes', { hits: [], unindexed: [note('fresh')] }))
    ).toEqual(['fresh']);
  });

  it('reads the bare array listRecentNotes returns', () => {
    expect(known(result('listRecentNotes', [note('recent')]))).toEqual([
      'recent',
    ]);
  });

  it('reads a single-object result such as getNote', () => {
    expect(known(result('getNote', note('one')))).toEqual(['one']);
  });

  it('ignores an output that carries no note', () => {
    expect(known(result('getNotesOverview', { total: 3, owned: 3 }))).toEqual(
      []
    );
  });
});

describe('collectSources', () => {
  it('credits only notes the agent actually opened', () => {
    const sink = new Map<string, AgentSource>();

    collectSources(
      [
        result('searchNotes', { hits: [note('searched')] }),
        result('getNote', note('opened')),
      ],
      sink
    );

    expect([...sink.keys()]).toEqual(['opened']);
  });
});
