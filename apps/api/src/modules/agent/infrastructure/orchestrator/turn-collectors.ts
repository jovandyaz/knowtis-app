import type { ToolSet, TypedToolResult } from 'ai';

import type { AgentSource } from '../../domain/agent-event';
import { isWithheldRead } from '../../domain/memory-taint';
import { isSourceNote } from '../../domain/tool-result-notes';

type StepToolResult = TypedToolResult<ToolSet>;

export function collectSources(
  toolResults: readonly StepToolResult[],
  sink: Map<string, AgentSource>
): void {
  for (const result of toolResults) {
    if (
      result.toolName !== 'getNote' ||
      !isSourceNote(result.output) ||
      isWithheldRead(result.output)
    ) {
      continue;
    }
    const { id, title } = result.output;
    if (!sink.has(id)) {
      sink.set(id, { id, title });
    }
  }
}
