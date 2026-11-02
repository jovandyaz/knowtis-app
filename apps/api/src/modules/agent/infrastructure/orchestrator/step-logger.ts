import type { GatewayLogger } from '@knowtis/ai-gateway';

/** The Nest `Logger` satisfies this, so the step loop never imports the framework. */
export interface StepLogger extends GatewayLogger {
  log(payload: Record<string, unknown>): void;
  debug(payload: Record<string, unknown>): void;
}
