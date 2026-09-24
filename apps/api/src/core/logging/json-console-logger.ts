import { inspect } from 'node:util';

import { ConsoleLogger, type LogLevel } from '@nestjs/common';

const SEVERITY = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

type Severity = (typeof SEVERITY)[keyof typeof SEVERITY];

const SEVERITY_BY_LEVEL: Record<LogLevel, Severity> = {
  verbose: SEVERITY.DEBUG,
  debug: SEVERITY.DEBUG,
  log: SEVERITY.INFO,
  warn: SEVERITY.WARN,
  error: SEVERITY.ERROR,
  fatal: SEVERITY.ERROR,
};

const DEFAULT_LOG_LEVEL: LogLevel = 'log';

const MESSAGE_FIELDS = ['message', 'event', 'operation'] as const;

const UNSERIALIZABLE_INSPECT_DEPTH = 4;

type WriteStream = 'stdout' | 'stderr';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isScalar(value: unknown): boolean {
  return (
    value === null || (typeof value !== 'object' && typeof value !== 'function')
  );
}

function firstNonEmptyText(candidates: unknown[]): string | undefined {
  return candidates.find(
    (value): value is string => typeof value === 'string' && value !== ''
  );
}

function errorFields(error: Error): Record<string, unknown> {
  const scalarProperties = Object.entries(error).filter(([, value]) =>
    isScalar(value)
  );
  return {
    ...Object.fromEntries(scalarProperties),
    name: error.name,
    message: error.message,
  };
}

/**
 * Writes each log call as one JSON line in the shape Railway's log explorer
 * parses: a non-empty string `message`, a `level` of debug/info/warn/error, and
 * the fields of object payloads at the top level, filterable as `@field:value`.
 * An `Error` argument becomes an `error` field and supplies `stack`. `level`,
 * `message`, `timestamp` and `context` always come from the call, never from a
 * payload.
 */
export class JsonConsoleLogger extends ConsoleLogger {
  constructor() {
    super({ json: true });
  }

  protected override printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = DEFAULT_LOG_LEVEL,
    writeStreamType?: WriteStream,
    errorStack?: unknown
  ): void {
    const fields: Record<string, unknown> = {};
    const texts: string[] = [];
    let error: Error | undefined;
    for (const message of messages) {
      if (isPlainObject(message)) {
        Object.assign(fields, message);
      } else if (message instanceof Error) {
        error ??= message;
        fields.error = errorFields(message);
      } else if (message !== undefined) {
        texts.push(String(message));
      }
    }
    const [lead, ...details] = texts;
    const envelope = {
      level: SEVERITY_BY_LEVEL[logLevel],
      message:
        firstNonEmptyText([
          lead,
          ...MESSAGE_FIELDS.map((field) => fields[field]),
          error?.message,
          context,
        ]) ?? logLevel,
      timestamp: new Date().toISOString(),
      context: context || undefined,
      stack: errorStack ?? error?.stack ?? fields.stack,
    };
    const extras = details.length > 0 ? { details } : {};
    process[writeStreamType ?? 'stdout'].write(
      `${this.serialize({ ...fields, ...extras, ...envelope }, envelope)}\n`
    );
  }

  private serialize(
    entry: Record<string, unknown>,
    envelope: Record<string, unknown>
  ): string {
    const replacer = (key: string, value: unknown) =>
      this.stringifyReplacer(key, value);
    try {
      return JSON.stringify(entry, replacer);
    } catch {
      // A circular payload must not turn the log call into a throw inside the
      // caller's catch block, which would hide the error being reported.
      const payload = inspect(entry, {
        depth: UNSERIALIZABLE_INSPECT_DEPTH,
        breakLength: Infinity,
      });
      return JSON.stringify({ ...envelope, payload }, replacer);
    }
  }
}
