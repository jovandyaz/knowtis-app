import { SpanStatusCode, type Context } from '@opentelemetry/api';
import type { tracing } from '@opentelemetry/sdk-node';

const EXCEPTION_EVENT = 'exception';
const EXCEPTION_TYPE = 'exception.type';
const UNKNOWN_ERROR = 'Error';

function isExceptionEvent(event: tracing.TimedEvent): boolean {
  return event.name === EXCEPTION_EVENT;
}

function scrubbed(span: tracing.ReadableSpan): tracing.ReadableSpan {
  const failed = span.status.code === SpanStatusCode.ERROR;
  if (!failed && !span.events.some(isExceptionEvent)) {
    return span;
  }
  const type = span.events.find(isExceptionEvent)?.attributes?.[EXCEPTION_TYPE];
  const errorType = typeof type === 'string' ? type : UNKNOWN_ERROR;
  return Object.create(span, {
    status: {
      value: failed
        ? { code: span.status.code, message: errorType }
        : span.status,
    },
    events: {
      value: span.events.map((event) =>
        isExceptionEvent(event)
          ? { ...event, attributes: { [EXCEPTION_TYPE]: errorType } }
          : event
      ),
    },
  }) as tracing.ReadableSpan;
}

/**
 * `recordInputs: false` only covers prompts and completions. The AI SDK still
 * copies a failed call's message and stack into the span, and providers echo
 * prompts and key fragments there, so spans leave with the error type alone.
 * The full message stays in our own logs, redacted for BYOK.
 */
export class ErrorScrubbingSpanProcessor implements tracing.SpanProcessor {
  constructor(private readonly next: tracing.SpanProcessor) {}

  onStart(span: tracing.Span, parentContext: Context): void {
    this.next.onStart(span, parentContext);
  }

  onEnd(span: tracing.ReadableSpan): void {
    this.next.onEnd(scrubbed(span));
  }

  forceFlush(): Promise<void> {
    return this.next.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.next.shutdown();
  }
}
