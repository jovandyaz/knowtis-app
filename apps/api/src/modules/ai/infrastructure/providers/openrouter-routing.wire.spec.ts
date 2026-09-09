import { tool } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AiSdkAgentOrchestrator } from '../../../agent/infrastructure/orchestrator/ai-sdk-agent.orchestrator';
import { AIConfigService } from '../../application/services/ai-config.service';
import { createMockConfig } from '../../testing/create-mock-config';
import { createTestChain } from '../../testing/create-test-chain';
import { AISDKProvider } from './ai-sdk.provider';
import { AIStructuredOutputSDKProvider } from './ai-structured-output-sdk.provider';

const PRIMARY = 'openrouter:deepseek/deepseek-v3.2';
const FALLBACK = 'openrouter:minimax/minimax-m2.5';
const schema = z.object({ answer: z.number() });

interface WireRequest {
  model: string;
  stream?: boolean;
  provider?: {
    order?: string[];
    ignore?: string[];
    require_parameters?: boolean;
  };
  response_format?: unknown;
  messages?: { role: string; content: unknown }[];
}

function completion(body: WireRequest, toolStep = false) {
  const content = body.response_format
    ? '{"answer":42}'
    : 'Local fixture answer';
  const base = { id: 'local-completion', model: body.model, created: 1 };
  const usage = { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 };
  if (!body.stream) {
    return Response.json({
      ...base,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage,
    });
  }
  const chunks = toolStep
    ? [
        {
          ...base,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'local-call',
                    type: 'function',
                    function: { name: 'calculate', arguments: '{}' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          ...base,
          choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
          usage,
        },
      ]
    : [
        {
          ...base,
          object: 'chat.completion.chunk',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content },
              finish_reason: null,
            },
          ],
        },
        {
          ...base,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage,
        },
      ];
  return new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
      'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
}

function harness(failPrimary = false, toolStep = false) {
  const requests: WireRequest[] = [];
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://openrouter.ai/api/v1/chat/completions'
      );
      const body = JSON.parse(String(init?.body)) as WireRequest;
      requests.push(body);
      if (failPrimary && body.model === PRIMARY.slice('openrouter:'.length)) {
        return Response.json(
          { error: { message: 'local primary unavailable', code: 503 } },
          { status: 503 }
        );
      }
      return completion(body, toolStep && requests.length === 1);
    }
  );
  const config = createMockConfig({
    OPENROUTER_API_KEY: 'local-not-a-real-key',
    AI_AGENT_MAX_MS: 10_000,
    AI_AGENT_MAX_OUTPUT_TOKENS: 256,
    AI_AGENT_STALL_MS: 5_000,
    AI_MAX_RETRIES: 0,
  });
  const { registry, chain } = createTestChain(config, FALLBACK);
  const values = new Map<string, string>([
    ['ai_openrouter_providers', 'parasail,fireworks'],
    ['ai_openrouter_ignored_providers', 'parasail'],
  ]);
  const cached = new Map<string, string>();
  const routing = new AIConfigService(
    { get: async (key: string) => values.get(key) ?? null } as never,
    {
      get: async (key: string) => cached.get(key),
      set: async (key: string, value: string) => {
        cached.set(key, value);
      },
    } as never,
    {} as never,
    registry,
    {} as never,
    {} as never
  );
  return { requests, config, registry, chain, routing };
}

describe('OpenRouter routing on the real AI SDK wire', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retains exclusions across real SDK tool continuations', async () => {
    const { requests, config, registry, chain, routing } = harness(false, true);
    const calculate = tool({
      inputSchema: z.object({}),
      execute: async () => 42,
    });
    const orchestrator = new AiSdkAgentOrchestrator(
      config,
      { resolve: async () => ({ calculate }) } as never,
      registry,
      chain,
      { isEnabled: async () => false } as never
    );
    const events = [];
    for await (const event of orchestrator.run({
      userId: 'local-user',
      messages: [{ role: 'user', content: 'test' }],
      model: PRIMARY,
      maxSteps: 3,
      maxTurnTokens: 1_000,
      openrouterProviderOrder: await routing.getOpenRouterProviderOrder(),
      openrouterIgnoredProviders: await routing.getOpenRouterIgnoredProviders(),
    })) {
      events.push(event);
    }
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'done', stopReason: 'completed' })
    );
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.provider).toMatchObject({
        ignore: ['parasail'],
        order: ['fireworks'],
      });
    }
    expect(requests[1]?.messages).toContainEqual(
      expect.objectContaining({ role: 'tool', content: '42' })
    );
  });

  it.each(['generate', 'stream', 'structured', 'agent'] as const)(
    'sends configured exclusions through %s and its model fallback',
    async (mode) => {
      const { requests, config, registry, chain, routing } = harness(true);
      if (mode === 'generate') {
        const result = await new AISDKProvider(
          registry,
          chain,
          routing
        ).generateCompletion('test', { model: PRIMARY, maxRetries: 0 });
        expect(result.text).toBe('Local fixture answer');
        expect(result.model).toBe(FALLBACK);
      } else if (mode === 'stream') {
        const result = new AISDKProvider(
          registry,
          chain,
          routing
        ).streamCompletion('test', { model: PRIMARY, maxRetries: 0 });
        let text = '';
        for await (const chunk of result.textStream) {
          text += chunk;
        }
        expect(text).toBe('Local fixture answer');
        await expect(result.usage).resolves.toMatchObject({
          model: FALLBACK,
          promptTokens: 4,
          completionTokens: 3,
        });
      } else if (mode === 'structured') {
        const result = await new AIStructuredOutputSDKProvider(
          registry,
          chain,
          routing
        ).generateStructuredOutput('test', schema, {
          model: PRIMARY,
          maxRetries: 0,
        });
        expect(result.object).toEqual({ answer: 42 });
        expect(result.model).toBe(FALLBACK);
      } else {
        const orchestrator = new AiSdkAgentOrchestrator(
          config,
          { resolve: async () => ({}) } as never,
          registry,
          chain,
          { isEnabled: async () => false } as never
        );
        const events = [];
        for await (const event of orchestrator.run({
          userId: 'local-user',
          messages: [{ role: 'user', content: 'test' }],
          model: PRIMARY,
          maxSteps: 3,
          maxTurnTokens: 1_000,
          openrouterProviderOrder: await routing.getOpenRouterProviderOrder(),
          openrouterIgnoredProviders:
            await routing.getOpenRouterIgnoredProviders(),
        })) {
          events.push(event);
        }
        expect(events).toContainEqual(
          expect.objectContaining({
            type: 'done',
            usage: expect.objectContaining({ model: FALLBACK }),
          })
        );
        expect(events.some((event) => event.type === 'error')).toBe(false);
      }
      expect(requests.map((request) => request.model)).toEqual([
        PRIMARY.slice(11),
        FALLBACK.slice(11),
      ]);
      for (const request of requests) {
        expect(request.provider).toMatchObject({
          order: ['fireworks'],
          ignore: ['parasail'],
        });
        if (mode === 'structured') {
          expect(request.provider?.require_parameters).toBe(true);
        }
      }
    }
  );
});
