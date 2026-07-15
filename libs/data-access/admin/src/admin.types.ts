import { z } from 'zod';

export const AdminUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  provider: z.string(),
  isAnonymous: z.boolean(),
  createdAt: z.coerce.date(),
  emailVerifiedAt: z.coerce.date().nullable(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const PaginatedUsersSchema = z.object({
  items: z.array(AdminUserSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
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

export interface AdminUsersParams {
  page: number;
  limit: number;
  search?: string;
}
