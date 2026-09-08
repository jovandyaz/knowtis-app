import { z } from 'zod';

import {
  GENERAL_ACCESS_LEVELS,
  PERMISSION_LEVELS,
} from '@knowtis/shared-types';

export const SharingAuthoritySchema = z.object({
  ownerId: z.uuid(),
  accessLevel: z.enum(['owner', 'viewer', 'editor']),
  generalAccess: z.enum(GENERAL_ACCESS_LEVELS),
  generalAccessPermission: z.enum(PERMISSION_LEVELS),
  shareToken: z.string().nullable(),
  editorsCanShare: z.boolean(),
});

export const PersonInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  permission: z.enum(['viewer', 'editor']),
});

export const NotePersonSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    avatarUrl: z.string().nullable(),
  }),
  permission: z.enum(['owner', 'viewer', 'editor']),
});

export const NotePeopleSchema = z.array(NotePersonSchema);
export type PersonInput = z.infer<typeof PersonInputSchema>;
