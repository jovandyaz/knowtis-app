import type { ApiProvider } from 'promptfoo';

import type { AgentEvalHarness } from './agent-eval-harness';
import type { NoteFixtureSetName } from './fixtures/note-sets';
import { createStructuredProvider } from './runtime/eval-runtime';
import type { EvalTranscript } from './transcript';

interface CopilotVars {
  readonly message: string;
  readonly fixtureSet: NoteFixtureSetName;
  readonly model?: string;
}

export function createCopilotProvider(
  harness: AgentEvalHarness,
  defaultModel: string
): ApiProvider {
  return createStructuredProvider<CopilotVars, EvalTranscript>(
    'knowtis-copilot',
    (vars) =>
      harness.runCase(vars.message, vars.fixtureSet, vars.model ?? defaultModel)
  );
}
