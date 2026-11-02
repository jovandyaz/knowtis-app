import { LangfuseSpanProcessor } from '@langfuse/otel';
import { LangfuseVercelAiSdkIntegration } from '@langfuse/vercel-ai-sdk';
import { SpanStatusCode } from '@opentelemetry/api';
import { tracing } from '@opentelemetry/sdk-node';
import { generateText, registerTelemetry } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ErrorScrubbingSpanProcessor } from './error-scrubbing-span-processor';

const SECRET = 'sk-or-echoed-byok-key and a quoted note';

describe('ErrorScrubbingSpanProcessor', () => {
  let exporter: tracing.InMemorySpanExporter;
  let langfuse: LangfuseSpanProcessor;
  let provider: tracing.BasicTracerProvider;

  beforeEach(() => {
    exporter = new tracing.InMemorySpanExporter();
    langfuse = new LangfuseSpanProcessor({
      publicKey: 'pk',
      secretKey: 'sk',
      exporter,
      exportMode: 'immediate',
      shouldExportSpan: () => true,
    });
    provider = new tracing.BasicTracerProvider({
      spanProcessors: [new ErrorScrubbingSpanProcessor(langfuse)],
    });
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  async function exported() {
    await provider.forceFlush();
    return exporter.getFinishedSpans();
  }

  it('keeps a provider error out of every span the AI SDK exports', async () => {
    registerTelemetry(
      new LangfuseVercelAiSdkIntegration({
        tracer: provider.getTracer('scrub-spec'),
      })
    );
    const model = new MockLanguageModelV4({
      doGenerate: () => Promise.reject(new TypeError(`refused: ${SECRET}`)),
    });

    await expect(
      generateText({
        model,
        prompt: 'hello',
        maxRetries: 0,
        telemetry: {
          recordInputs: false,
          recordOutputs: false,
          functionId: 'scrub-spec',
        },
      })
    ).rejects.toThrow('refused');

    const spans = await exported();
    expect(spans.length).toBeGreaterThan(0);
    expect(JSON.stringify(spans.map(serialize))).not.toContain('sk-or-');
  });

  it('keeps the failure and its type visible', async () => {
    const span = provider.getTracer('scrub-spec').startSpan('call');
    span.recordException(new TypeError(SECRET));
    span.setStatus({ code: SpanStatusCode.ERROR, message: SECRET });
    span.end();

    const [result] = await exported();

    expect(result?.status).toEqual({
      code: SpanStatusCode.ERROR,
      message: 'TypeError',
    });
    expect(result?.events.map((event) => event.attributes)).toEqual([
      { 'exception.type': 'TypeError' },
    ]);
  });

  it('leaves spans without an error and their other events alone', async () => {
    const span = provider.getTracer('scrub-spec').startSpan('call');
    span.setAttribute('gen_ai.request.model', 'mock');
    span.addEvent('first-chunk', { position: 1 });
    span.end();

    const [result] = await exported();

    expect(result?.name).toBe('call');
    expect(result?.status.code).toBe(SpanStatusCode.UNSET);
    expect(result?.attributes['gen_ai.request.model']).toBe('mock');
    expect(result?.events.map((event) => event.attributes)).toEqual([
      { position: 1 },
    ]);
  });
});

function serialize(span: tracing.ReadableSpan) {
  return {
    attributes: span.attributes,
    events: span.events,
    status: span.status,
  };
}
