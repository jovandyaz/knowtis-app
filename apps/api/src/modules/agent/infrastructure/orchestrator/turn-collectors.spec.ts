import type { ToolSet, TypedToolResult } from 'ai';
import { describe, expect, it } from 'vitest';

import type { AgentSource } from '../../domain/agent-event';
import { collectSources } from './turn-collectors';

const note = (id: string) => ({ id, title: `title-${id}` });

function result(toolName: string, output: unknown): TypedToolResult<ToolSet> {
  return { toolName, output } as unknown as TypedToolResult<ToolSet>;
}

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

  it('credits no note whose content the injection guard withheld', () => {
    const sink = new Map<string, AgentSource>();

    collectSources(
      [
        result('getNote', { ...note('withheld'), contentStatus: 'withheld' }),
        result('getNote', { ...note('read'), contentStatus: 'complete' }),
      ],
      sink
    );

    expect([...sink.keys()]).toEqual(['read']);
  });
});
