import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AgentMessage } from '../domain/agent-message';
import type { AgentEvalHarness } from './agent-eval-harness';
import { evalGateOpen, resolveEvalModel } from './runtime/eval-runtime';
import {
  FIXTURE_SET,
  FOLLOW_UP_MESSAGE,
  OPENING_MESSAGE,
  REPLAY_ONLY_FACTS,
} from './transcript-replay.fixtures';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const DEFAULT_AGENT_MODEL = 'anthropic:claude-sonnet-5';
const MIN_ANSWER_LENGTH = 20;
const BOOT_TIMEOUT_MS = 120_000;
const EVAL_TIMEOUT_MS = 300_000;

describe.runIf(evalGateOpen())('transcript replay', () => {
  let harness: AgentEvalHarness;
  const model = resolveEvalModel('AI_EVAL_MODEL', DEFAULT_AGENT_MODEL);

  beforeAll(async () => {
    const { AgentEvalHarness } = await import('./agent-eval-harness');
    harness = await AgentEvalHarness.boot();
  }, BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await harness?.close();
  });

  it(
    'answers a follow-up from the replayed tool result without calling the tool again',
    async () => {
      const turn1 = await harness.runConversation(
        [{ role: 'user', content: OPENING_MESSAGE }],
        FIXTURE_SET,
        model
      );
      expect(turn1.toolCalls.map((c) => c.name)).toContain('getNote');

      const history: AgentMessage[] = [
        { role: 'user', content: OPENING_MESSAGE },
        ...turn1.steps.flat(),
      ];
      const replayedToolRows = history.filter((m) => m.role === 'tool');
      expect(replayedToolRows.length).toBeGreaterThan(0);
      const replayed = JSON.stringify(replayedToolRows);
      expect(REPLAY_ONLY_FACTS.every((f) => replayed.includes(f))).toBe(true);

      const turn2 = await harness.runConversation(
        [...history, { role: 'user', content: FOLLOW_UP_MESSAGE }],
        FIXTURE_SET,
        model
      );

      expect(turn2.error).toBeNull();
      expect(turn2.toolCalls).toEqual([]);
      expect(turn2.text.length).toBeGreaterThan(MIN_ANSWER_LENGTH);
      expect(REPLAY_ONLY_FACTS.some((f) => turn2.text.includes(f))).toBe(true);
    },
    EVAL_TIMEOUT_MS
  );
});
