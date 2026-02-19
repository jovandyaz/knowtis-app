import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long')
    .optional(),
  avatarUrl: z.string().max(500).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
