import { z } from 'zod';

/** Discard entry for an upstream payload whose `id` itself failed to parse: the model's identity is unknown, so no absence may be concluded while one is present. */
export const UNPARSEABLE_MODEL_ID = '<unparseable>';

/** How many discarded ids one discard warning lists. */
export const DISCARD_LOG_SAMPLE_SIZE = 10;

const modelIdSchema = z.object({ id: z.string() });

/** The `id` a raw upstream model entry declares, or `UNPARSEABLE_MODEL_ID` when it declares none. */
export function upstreamIdOf(raw: unknown): string {
  const parsed = modelIdSchema.safeParse(raw);
  return parsed.success ? parsed.data.id : UNPARSEABLE_MODEL_ID;
}
