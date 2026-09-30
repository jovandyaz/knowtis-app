import { asSchema } from 'ai';
import { describe, expect, it } from 'vitest';

import { estimateTokenCount } from '@knowtis/ai-gateway';

import { validateEnv } from '../../../../config/env.config';
import { createExecutionContext } from '../../../ai/testing/create-execution-context';
import { AGENT_PROMPT_OVERHEAD_TOKENS } from '../../domain/first-call-budget';
import { NoteMutateToolGroup } from '../tools/note-mutate.tool-group';
import { NoteReadToolGroup } from '../tools/note-read.tool-group';
import { WebToolGroup } from '../tools/web.tool-group';
import { AgentToolRegistry } from './agent-tool.registry';
import { composeSystemPrompt } from './compose-system-prompt';
import { ProposalCollector } from './proposal-collector';
import { WebFetchAllowlist } from './web-fetch-allowlist';
import { WebSourceCollector } from './web-source.collector';

const NOTE_ID = '8f14e45f-ceea-4671-9f1b-8f0c1c2d3e4f';
const MEMORY_MAX_CHARS = 300;
const MEMORY =
  'Prefers answers in Spanish; project "Knowtis 2026-Q4" tracks PARA tags #work/#ideas, reviews on Fridays at 09:30 (UTC-6); '
    .repeat(3)
    .slice(0, MEMORY_MAX_CHARS);

const SHIPPED_ENV = validateEnv({
  DATABASE_URL: 'postgres://localhost:5432/knowtis_test',
  JWT_SECRET: 'a'.repeat(40) + '-access-secret-x',
  JWT_REFRESH_SECRET: 'b'.repeat(40) + '-refresh-secret-x',
  TOKEN_HASH_KEY: 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=',
});

async function composedOverheadTokens(): Promise<number> {
  const tools = new AgentToolRegistry([
    new NoteReadToolGroup({} as never),
    new NoteMutateToolGroup({} as never),
    new WebToolGroup(
      { isConfigured: () => true } as never,
      {} as never,
      {} as never
    ),
  ]).resolve({
    phase: 'full',
    execution: createExecutionContext(),
    proposals: new ProposalCollector(),
    webSources: new WebSourceCollector(),
    webFetchAllowlist: new WebFetchAllowlist(),
  });
  const definitions = await Promise.all(
    Object.entries(tools).map(async ([name, definition]) =>
      JSON.stringify({
        name,
        description: definition.description,
        input_schema: await asSchema(definition.inputSchema).jsonSchema,
      })
    )
  );
  const memories = Array.from(
    { length: SHIPPED_ENV.AI_MEMORY_RETRIEVAL_K },
    () => MEMORY
  );
  const systemPrompt = composeSystemPrompt(NOTE_ID, [], memories);
  return definitions.reduce(
    (total, definition) => total + estimateTokenCount(definition),
    estimateTokenCount(systemPrompt)
  );
}

describe('AGENT_PROMPT_OVERHEAD_TOKENS', () => {
  it('covers the system prompt with the most memories a turn retrieves and every tool definition', async () => {
    expect(await composedOverheadTokens()).toBeLessThanOrEqual(
      AGENT_PROMPT_OVERHEAD_TOKENS
    );
  });
});
