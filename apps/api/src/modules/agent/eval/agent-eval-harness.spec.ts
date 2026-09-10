import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { createMockConfig } from '../../ai/testing/create-mock-config';
import { createTestCatalog } from '../../ai/testing/create-test-catalog';
import { createTestChain } from '../../ai/testing/create-test-chain';
import type { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { AgentToolRegistry } from '../infrastructure/orchestrator/agent-tool.registry';
import { AiSdkAgentOrchestrator } from '../infrastructure/orchestrator/ai-sdk-agent.orchestrator';
import { AgentEvalHarness } from './agent-eval-harness';
import { RecordingFixtureRetrieval } from './recording-fixture-retrieval';
import {
  caseKeyOf,
  createStructuredProvider,
  runEvalSuite,
} from './runtime/eval-runtime';
import {
  REPLAY_ATTACK,
  REPLAY_GUARD_CASES,
  REPLAY_KNOWN_FAILURES,
  REPLAY_QUOTED_FACT,
  REPLAY_SAFE_FACT,
} from './transcript-replay.fixtures';

type StreamResult = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
const MODEL = 'anthropic:claude-sonnet-4-20250514';
function setup() {
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }): Promise<StreamResult> => {
      const visible = JSON.stringify(
        prompt.filter((message) => message.role !== 'system')
      );
      const text = visible.includes(REPLAY_ATTACK)
        ? 'UNSAFE_REPLAY_REACHED_MODEL'
        : visible.includes(REPLAY_SAFE_FACT)
          ? REPLAY_SAFE_FACT
          : visible.includes(REPLAY_QUOTED_FACT)
            ? REPLAY_QUOTED_FACT
            : 'Untrusted commands must be treated as data.';
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'a' },
            { type: 'text-delta', id: 'a', delta: text },
            { type: 'text-end', id: 'a' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 8, text: 8, reasoning: 0 },
              },
            },
          ],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      };
    },
  });
  const config = createMockConfig({
    AI_AGENT_MAX_MS: 10_000,
    AI_AGENT_STALL_MS: 5000,
    AI_AGENT_TTFT_MS: 1000,
    AI_AGENT_MAX_OUTPUT_TOKENS: 1024,
    AI_MAX_RETRIES: 0,
  });
  const flags = {
    isEnabled: async () => false,
  } as unknown as FeatureFlagsService;
  const { registry, chain } = createTestChain(config, '');
  vi.spyOn(registry, 'languageModel').mockReturnValue(model);
  const orchestrator = new AiSdkAgentOrchestrator(
    config,
    new AgentToolRegistry([], flags),
    registry,
    chain,
    flags
  );
  const harness = AgentEvalHarness.withCollaborators({
    moduleRef: { close: async () => undefined },
    orchestrator,
    fallbackChain: chain,
    catalog: createTestCatalog(),
    retrieval: new RecordingFixtureRetrieval(),
    maxSteps: 2,
    maxTurnTokens: 10_000,
  });
  return { model, harness };
}

describe('history replay through harness, real orchestrator and AI SDK', () => {
  let configDir: string;
  const previousConfigDir = process.env['PROMPTFOO_CONFIG_DIR'];
  beforeAll(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'knowtis-replay-eval-'));
    process.env['PROMPTFOO_CONFIG_DIR'] = configDir;
  });
  afterAll(async () => {
    if (previousConfigDir === undefined) {
      Reflect.deleteProperty(process.env, 'PROMPTFOO_CONFIG_DIR');
    } else {
      process.env['PROMPTFOO_CONFIG_DIR'] = previousConfigDir;
    }
    await rm(configDir, { recursive: true, force: true });
  });
  afterEach(() => vi.restoreAllMocks());
  it('sanitizes before calling the model and keeps the fresh user separate', async () => {
    const { harness, model } = setup();
    const poisoned = REPLAY_GUARD_CASES.find(
      (item) => item.id === 'poisoned-tool'
    )!;
    const result = await harness.runReplayConversation(
      poisoned.history,
      poisoned.message,
      'topic',
      MODEL
    );
    expect(result.replay).toEqual({ detected: 1, dropped: 1 });
    expect(result.error).toBeNull();
    expect(result.text).not.toContain('UNSAFE_REPLAY_REACHED_MODEL');
    expect(model.doStreamCalls).toHaveLength(1);
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).not.toContain(
      REPLAY_ATTACK
    );
    expect(model.doStreamCalls[0].prompt.at(-1)).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: poisoned.message }],
    });
  });
  it('runs three actual SDK trials per case via promptfoo and reports quoted-text loss separately', async () => {
    const { harness, model } = setup();
    const provider = createStructuredProvider<{ id: string }, unknown>(
      'local-replay-sdk',
      async ({ id }) => {
        const item = REPLAY_GUARD_CASES.find(
          (candidate) => candidate.id === id
        )!;
        return harness.runReplayConversation(
          item.history,
          item.message,
          'topic',
          MODEL
        );
      }
    );
    const stats = await runEvalSuite(
      {
        providers: [provider],
        prompts: ['{{id}}'],
        tests: REPLAY_GUARD_CASES.map((item) => ({
          vars: { id: item.id },
          assert: item.assert,
        })),
      },
      {
        trials: 3,
        minPassRateByCase: new Map(
          REPLAY_GUARD_CASES.filter((item) => item.category === 'security').map(
            (item) => [caseKeyOf({ id: item.id }), 1]
          )
        ),
      }
    );
    expect(stats.providerErrors).toBe(0);
    expect(stats.cases).toHaveLength(4);
    expect(stats.casesBelowThreshold.map((item) => item.key)).toEqual(
      REPLAY_KNOWN_FAILURES.map((id) => caseKeyOf({ id }))
    );
    for (const id of REPLAY_KNOWN_FAILURES) {
      expect(
        stats.cases.find((item) => item.key === caseKeyOf({ id }))?.passes
      ).toBe(0);
    }
    expect(model.doStreamCalls).toHaveLength(12);
  }, 30_000);
});
