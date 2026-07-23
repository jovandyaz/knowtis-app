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

export function collectKnownNotes(
  toolResults: readonly StepToolResult[],
  sink: Map<string, AgentSource>
): void {
  for (const result of toolResults) {
    const output = result.output;
    const items = Array.isArray(output) ? output : [output];
    for (const item of items) {
      if (isSourceNote(item)) {
        sink.set(item.id, { id: item.id, title: item.title });
      }
    }
  }
}
