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

const MESSAGE_FIELDS = ['message', 'event', 'operation'] as const;

interface JsonPrintOptions {
  context: string;
  logLevel: LogLevel;
  writeStreamType?: 'stdout' | 'stderr';
  errorStack?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function messageText(message: unknown, context: string): string {
  if (!isPlainObject(message)) {
    return String(message);
  }
  const text = MESSAGE_FIELDS.map((field) => message[field]).find(
    (value): value is string => typeof value === 'string'
  );
  return text ?? context;
}

/**
 * Writes every entry as one JSON line in the shape Railway's log explorer
 * parses: a string `message`, a `level` of debug/info/warn/error, and each
 * field of an object payload at the top level, filterable as `@field:value`.
 */
export class JsonConsoleLogger extends ConsoleLogger {
  constructor() {
    super({ json: true });
  }

  protected override printAsJson(
    message: unknown,
    options: JsonPrintOptions
  ): void {
    const entry = {
      ...(isPlainObject(message) ? message : {}),
      level: SEVERITY_BY_LEVEL[options.logLevel],
      message: messageText(message, options.context),
      timestamp: new Date().toISOString(),
      ...(options.context && { context: options.context }),
      ...(options.errorStack !== undefined && { stack: options.errorStack }),
    };
    const line = JSON.stringify(entry, (key, value) =>
      this.stringifyReplacer(key, value)
    );
    process[options.writeStreamType ?? 'stdout'].write(`${line}\n`);
  }
}
