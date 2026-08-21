import { z } from 'zod';

import { MAX_SUGGESTED_TAGS, PARA_BUCKETS } from '@knowtis/shared-types';

/**
 * `.nullable()` rather than `.optional()`: OpenAI strict mode requires every
 * declared property to be present in the response.
 */
export const suggestOrganizationSchema = z.object({
  bucket: z
    .enum(PARA_BUCKETS)
    .nullable()
    .describe('PARA bucket, or null when the note is too thin to place'),
  tags: z
    .array(z.string())
    .max(MAX_SUGGESTED_TAGS)
    .describe('Tag paths, preferring the vocabulary supplied in the request'),
});
