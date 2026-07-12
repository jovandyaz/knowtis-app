import { z } from 'zod';

export const MCP_KEY_SCOPE_OPTIONS = [
  'notes:read',
  'notes:read,notes:write',
  'notes:read,notes:write,notes:share',
] as const;

export const createMcpKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  scopes: z.enum(MCP_KEY_SCOPE_OPTIONS),
});

export type CreateMcpKeyFormValues = z.infer<typeof createMcpKeySchema>;
