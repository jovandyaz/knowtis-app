export const AI_DEPENDENCIES = ['tier', 'quota'] as const;
export type AiDependency = (typeof AI_DEPENDENCIES)[number];

/** A store the AI edge reads before any model call failed; the same request may succeed on retry. */
export class AiUnavailableError extends Error {
  constructor(
    readonly dependency: AiDependency,
    reason: string,
    options?: { readonly cause?: unknown }
  ) {
    super(`${dependency} unavailable: ${reason}`, options);
    this.name = 'AiUnavailableError';
  }
}
