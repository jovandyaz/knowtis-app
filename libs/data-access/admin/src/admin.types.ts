import { USER_ROLE } from '@jovandyaz/auth';
import { z } from 'zod';

import { MODEL_TIERS } from '@knowtis/shared-types';

export const AdminUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum([USER_ROLE.USER, USER_ROLE.ADMIN]),
  provider: z.string(),
  isAnonymous: z.boolean(),
  createdAt: z.coerce.date(),
  emailVerifiedAt: z.coerce.date().nullable(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
  });
}

export const PaginatedUsersSchema = paginatedSchema(AdminUserSchema);
export type PaginatedUsers = z.infer<typeof PaginatedUsersSchema>;

export const DailyUsageSchema = z.object({
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
  requestCount: z.number(),
});
export type DailyUsage = z.infer<typeof DailyUsageSchema>;

export const MetricsSummarySchema = z.object({
  totalRequests: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
  byAction: z.record(
    z.string(),
    z.object({ requests: z.number(), tokens: z.number(), costUsd: z.number() })
  ),
});
export type MetricsSummary = z.infer<typeof MetricsSummarySchema>;

export const METRICS_PERIODS = ['day', 'week', 'month'] as const;
export type MetricsPeriod = (typeof METRICS_PERIODS)[number];

export const FeatureFlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  description: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

export interface AdminUsersParams {
  page: number;
  limit: number;
  search?: string;
}

export const AuditEntrySchema = z.object({
  id: z.uuid(),
  actorId: z.uuid(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const PaginatedAuditSchema = paginatedSchema(AuditEntrySchema);
export type PaginatedAudit = z.infer<typeof PaginatedAuditSchema>;

export type AuditParams = Pick<AdminUsersParams, 'page' | 'limit'>;

export const AiConfigEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
  source: z.enum(['database', 'environment']),
  description: z.string().nullable(),
  updatedAt: z.coerce.date().nullable(),
});
export type AiConfigEntry = z.infer<typeof AiConfigEntrySchema>;

export const AiConfigSchema = z.array(AiConfigEntrySchema);

export const SelectableModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  tier: z.enum(MODEL_TIERS),
  costClass: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  contextWindow: z.number(),
  billedToUser: z.boolean(),
});
export type SelectableModelOption = z.infer<typeof SelectableModelSchema>;

export const SelectableModelsSchema = z.array(SelectableModelSchema);
