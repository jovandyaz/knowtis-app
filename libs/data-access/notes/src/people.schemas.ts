import { z } from 'zod';

import {
  ACCESS_LEVELS,
  GENERAL_ACCESS_LEVELS,
  PERMISSION_LEVELS,
} from '@knowtis/shared-types';

export const SharingAuthoritySchema = z.object({
  ownerId: z.uuid(),
  accessLevel: z.enum(ACCESS_LEVELS),
  generalAccess: z.enum(GENERAL_ACCESS_LEVELS),
  generalAccessPermission: z.enum(PERMISSION_LEVELS),
  shareToken: z.string().nullable(),
  editorsCanShare: z.boolean(),
});

export const PersonInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  permission: z.enum(PERMISSION_LEVELS),
});

export const NotePersonSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    avatarUrl: z.string().nullable(),
  }),
  permission: z.enum(ACCESS_LEVELS),
});

export const NotePeopleSchema = z.array(NotePersonSchema);
export type PersonInput = z.infer<typeof PersonInputSchema>;
