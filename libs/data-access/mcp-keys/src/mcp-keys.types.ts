import { z } from 'zod';

export const createMcpKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  scopes: z.string().min(1),
});

export type CreateMcpKeyFormValues = z.infer<typeof createMcpKeySchema>;
