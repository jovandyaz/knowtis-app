import { Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';

import type { MessageStopReason } from '@knowtis/shared-types';

import { DATABASE_CLIENT } from '../../../../database';
import type { ToolOutputType } from '../../domain/agent-message';
import type { AgentHealthWindowStats } from './agent-health.evaluator';

const TOOL_ERROR_OUTPUT_TYPES: readonly ToolOutputType[] = [
  'error-text',
  'error-json',
  'execution-denied',
];
const NO_ANSWER_STOP_REASONS: readonly MessageStopReason[] = [
  'length',
  'content_filter',
  'error',
];
// Not btrim(): it strips only spaces, so a newline-only completion would
// count as an answer.
const BLANK_CONTENT_PATTERN = '^[[:space:]]*$';

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
    const [turnRow] = await this.client<
      { terminal_turns: string; no_answer_turns: string }[]
    >`
      SELECT
        COUNT(*) AS terminal_turns,
        COUNT(*) FILTER (
          WHERE stop_reason = ANY(${NO_ANSWER_STOP_REASONS})
            OR content ~ ${BLANK_CONTENT_PATTERN}
        ) AS no_answer_turns
      FROM conversation_messages
      WHERE role = 'assistant'
        AND stop_reason IS NOT NULL
        AND stop_reason <> 'aborted'
        AND created_at >= ${sinceIso}
    `;
    return {
      toolCalls: Number(toolRow?.tool_calls ?? 0),
      toolErrors: Number(toolRow?.tool_errors ?? 0),
      terminalTurns: Number(turnRow?.terminal_turns ?? 0),
      noAnswerTurns: Number(turnRow?.no_answer_turns ?? 0),
    };
  }
}
