import { z } from 'zod';

import { SUPPORTED_LOCALES } from '@knowtis/shared-util';

export const UpdateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long')
    .optional(),
  avatarUrl: z.string().max(500).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
});
