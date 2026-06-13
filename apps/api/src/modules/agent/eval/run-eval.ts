import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';

import { COPILOT_EVAL_CASES } from './cases';
import { createCopilotProvider } from './copilot-provider';
import {
  evalGateOpen,
  resolveEvalModel,
  runEvalSuite,
} from './runtime/eval-runtime';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const DEFAULT_AGENT_MODEL = 'anthropic:claude-sonnet-4-20250514';
const GRADER_PROVIDER = 'anthropic:messages:claude-haiku-4-5-20251001';

async function main(): Promise<void> {
  if (!evalGateOpen()) {
    process.exit(0);
  }

  const model = resolveEvalModel('AI_EVAL_MODEL', DEFAULT_AGENT_MODEL);
  const { AgentEvalHarness } = await import('./agent-eval-harness');
  const harness = await AgentEvalHarness.boot();
  try {
    const provider = createCopilotProvider(harness, model);
    await runEvalSuite({
      providers: [provider],
      prompts: ['{{message}}'],
      tests: COPILOT_EVAL_CASES,
      defaultTest: { options: { provider: GRADER_PROVIDER } },
    });
  } finally {
    await harness.close();
  }
}

void main();
