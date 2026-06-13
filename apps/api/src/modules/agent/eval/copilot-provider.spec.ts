import { describe, expect, it, vi } from 'vitest';

import type { AgentEvalHarness } from './agent-eval-harness';
import { createCopilotProvider } from './copilot-provider';
import type { EvalTranscript } from './transcript';

const TRANSCRIPT: EvalTranscript = {
  toolCalls: [{ name: 'listRecentNotes', args: { limit: 5 } }],
  text: 'recent stuff',
  proposal: null,
  sources: [],
  error: null,
};

describe('createCopilotProvider', () => {
  it('reads vars and returns the harness transcript as output', async () => {
    const runCase = vi.fn(async () => TRANSCRIPT);
    const harness = { runCase } as unknown as AgentEvalHarness;

    const provider = createCopilotProvider(harness, 'anthropic:default-model');
    const res = await provider.callApi('ignored', {
      vars: { message: 'recent?', fixtureSet: 'recent' },
    } as never);

    expect(runCase).toHaveBeenCalledWith(
      'recent?',
      'recent',
      'anthropic:default-model'
    );
    expect(res).toEqual({ output: TRANSCRIPT });
  });

  it('prefers a per-case model override from vars', async () => {
    const runCase = vi.fn(async () => TRANSCRIPT);
    const harness = { runCase } as unknown as AgentEvalHarness;

    const provider = createCopilotProvider(harness, 'anthropic:default-model');
    await provider.callApi('ignored', {
      vars: {
        message: 'recent?',
        fixtureSet: 'recent',
        model: 'anthropic:override',
      },
    } as never);

    expect(runCase).toHaveBeenCalledWith(
      'recent?',
      'recent',
      'anthropic:override'
    );
  });
});
