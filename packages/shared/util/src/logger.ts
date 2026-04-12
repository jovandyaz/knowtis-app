interface LogOptions {
  error?: unknown;
  context?: string;
}

interface Logger {
  error(message: string, options?: LogOptions): void;
  warn(message: string, options?: LogOptions): void;
  info(message: string, options?: LogOptions): void;
}

function formatArgs(message: string, options?: LogOptions): unknown[] {
  const args: unknown[] = [];

  if (options?.context) {
    args.push(`[${options.context}]`);
  }

  args.push(message);

  if (options?.error) {
    args.push(options.error);
  }

  return args;
}

function createLogger(): Logger {
  return {
    error(message: string, options?: LogOptions): void {
      console.error(...formatArgs(message, options));
    },
    warn(message: string, options?: LogOptions): void {
      console.warn(...formatArgs(message, options));
    },
    info(message: string, options?: LogOptions): void {
      // eslint-disable-next-line no-console
      console.info(...formatArgs(message, options));
    },
  };
}

export const logger = createLogger();
