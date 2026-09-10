import type { ToolSet, TypedToolResult } from 'ai';

import type { AgentSource } from '../../domain/agent-event';

type StepToolResult = TypedToolResult<ToolSet>;

function isSourceNote(value: unknown): value is { id: string; title: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'title' in value &&
    typeof value.id === 'string' &&
    typeof value.title === 'string'
  );
}

export function collectSources(
  toolResults: readonly StepToolResult[],
  sink: Map<string, AgentSource>
): void {
  for (const result of toolResults) {
    if (result.toolName !== 'getNote' || !isSourceNote(result.output)) {
      continue;
    }
    const { id, title } = result.output;
    if (!sink.has(id)) {
      sink.set(id, { id, title });
    }
  }
}

/** `searchNotes` reports `{hits, unindexed}`; `listRecentNotes` a bare array. */
function noteCandidates(output: unknown): unknown[] {
  if (Array.isArray(output)) {
    return output;
  }
  if (typeof output === 'object' && output !== null && 'hits' in output) {
    const { hits, unindexed } = output as {
      hits?: unknown;
      unindexed?: unknown;
    };
    return [
      ...(Array.isArray(hits) ? hits : []),
      ...(Array.isArray(unindexed) ? unindexed : []),
    ];
  }
  return [output];
}

export function collectKnownNotes(
  toolResults: readonly StepToolResult[],
  sink: Map<string, AgentSource>
): void {
  for (const result of toolResults) {
    for (const item of noteCandidates(result.output)) {
      if (isSourceNote(item)) {
        sink.set(item.id, { id: item.id, title: item.title });
      }
    }
  }
}
