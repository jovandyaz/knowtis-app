import type { RouterLogger } from '@jovandyaz/llm-router';

/** The Nest `Logger` satisfies this, so the step loop never imports the framework. */
export interface StepLogger extends RouterLogger {
  log(payload: Record<string, unknown>): void;
  debug(payload: Record<string, unknown>): void;
}
