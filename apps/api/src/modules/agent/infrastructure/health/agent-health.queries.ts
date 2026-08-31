import { Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';

import { DATABASE_CLIENT } from '../../../../database';
import type { AgentHealthWindowStats } from './agent-health.evaluator';

const TOOL_ERROR_OUTPUT_TYPES = [
  'error-text',
  'error-json',
  'execution-denied',
];
const ANOMALOUS_STOP_REASONS = [
  'max_steps',
  'token_budget',
  'length',
  'content_filter',
  'error',
];

@Injectable()
export class AgentHealthQueries {
  constructor(@Inject(DATABASE_CLIENT) private readonly client: Sql) {}

  async collectWindowStats(since: Date): Promise<AgentHealthWindowStats> {
    // drizzle(client) swaps the shared client's timestamptz serializer for an
    // identity fn, so a raw Date crashes the wire encoder; bind the ISO string.
    const sinceIso = since.toISOString();
    const [toolRow] = await this.client<
      { tool_calls: string; tool_errors: string }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE part->>'type' = 'tool-result') AS tool_calls,
        COUNT(*) FILTER (
          WHERE part->>'type' = 'tool-result'
            AND part->>'outputType' = ANY(${TOOL_ERROR_OUTPUT_TYPES})
        ) AS tool_errors
      FROM conversation_messages m
      CROSS JOIN LATERAL jsonb_array_elements(m.parts->'parts') AS part
      WHERE m.role = 'tool' AND m.parts IS NOT NULL AND m.created_at >= ${sinceIso}
    `;
    const [stopRow] = await this.client<
      { stop_turns: string; anomalous_stops: string }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE stop_reason <> 'aborted') AS stop_turns,
        COUNT(*) FILTER (
          WHERE stop_reason = ANY(${ANOMALOUS_STOP_REASONS})
        ) AS anomalous_stops
      FROM conversation_messages
      WHERE role = 'assistant' AND stop_reason IS NOT NULL AND created_at >= ${sinceIso}
    `;
    return {
      toolCalls: Number(toolRow?.tool_calls ?? 0),
      toolErrors: Number(toolRow?.tool_errors ?? 0),
      stopTurns: Number(stopRow?.stop_turns ?? 0),
      anomalousStops: Number(stopRow?.anomalous_stops ?? 0),
    };
  }
}
