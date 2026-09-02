import { USER_ROLE } from '@jovandyaz/auth';
import { z } from 'zod';

import {
  AI_CONFIG_SOURCES,
  AI_PROVIDERS,
  CATALOG_MODEL_STATUSES,
  CATALOG_SYNC_STATUSES,
  MODEL_TIERS,
  PROVIDER_KEY_SOURCES,
  PROVIDER_PROBE_FAILURES,
} from '@knowtis/shared-types';

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

const MetricsBreakdownSchema = z.object({
  requests: z.number(),
  tokens: z.number(),
  costUsd: z.number(),
});

export const MetricsSummarySchema = z.object({
  totalRequests: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
  byAction: z.record(z.string(), MetricsBreakdownSchema),
  byModel: z.record(z.string(), MetricsBreakdownSchema),
});
export type MetricsSummary = z.infer<typeof MetricsSummarySchema>;

export const METRICS_PERIODS = ['day', 'week', 'month'] as const;
export type MetricsPeriod = (typeof METRICS_PERIODS)[number];

export const TimeseriesBucketSchema = z.object({
  bucketStart: z.coerce.date(),
  requests: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
});
export type TimeseriesBucket = z.infer<typeof TimeseriesBucketSchema>;

export const MetricsTimeseriesSchema = z.object({
  buckets: z.array(TimeseriesBucketSchema),
});
export type MetricsTimeseries = z.infer<typeof MetricsTimeseriesSchema>;

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
  role?: 'user' | 'admin';
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
  // Backoffice and API deploy independently; kept loose so an API that predates
  // `kind` or emits one this bundle does not know yet renders nothing for that
  // entry rather than failing the whole page.
  kind: z.string().default('model'),
  // Backoffice and API deploy independently; a source added after this bundle
  // shipped must not fail the whole page. `default` is the fallback because it
  // renders no destructive action for a state this bundle does not understand.
  source: z.enum(AI_CONFIG_SOURCES).catch('default'),
  // Backoffice and API deploy independently; an API that predates the stale
  // state simply never sets it.
  storedValue: z.string().nullable().default(null),
  description: z.string().nullable(),
  updatedAt: z.coerce.date().nullable(),
});
export type AiConfigEntry = z.infer<typeof AiConfigEntrySchema>;

export const AiConfigSchema = z.array(AiConfigEntrySchema);

export const AssignableModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  tier: z.enum(MODEL_TIERS),
  provider: z.string(),
  routableByServer: z.boolean(),
  needsKey: z.boolean(),
  promoted: z.boolean(),
});

export const AssignableModelsSchema = z.array(AssignableModelSchema);

export const SystemProviderSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  enabled: z.boolean(),
  keySource: z.enum(PROVIDER_KEY_SOURCES),
  storedKeyUnreadable: z.boolean(),
  keyPrefix: z.string().nullable(),
  updatedAt: z.coerce.date().nullable(),
});
export type SystemProvider = z.infer<typeof SystemProviderSchema>;

export const SystemProvidersSchema = z.array(SystemProviderSchema);

/** Informational verdict on a just-saved key — the key is stored either way. */
export const ProviderKeyProbeSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
});
export type ProviderKeyProbe = z.infer<typeof ProviderKeyProbeSchema>;

export const SetSystemProviderResultSchema = z.object({
  providers: SystemProvidersSchema,
  probe: ProviderKeyProbeSchema.optional(),
});
export type SetSystemProviderResult = z.infer<
  typeof SetSystemProviderResultSchema
>;

export const ProviderTestResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), model: z.string() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(PROVIDER_PROBE_FAILURES),
    message: z.string(),
  }),
]);
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;

const ProviderHealthSchema = z.object({
  configured: z.boolean(),
  cooling: z.boolean(),
  failureCount: z.number().int().nonnegative(),
  lastFailureAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  cooldownEndsAt: z.string().nullable(),
});

export const AiHealthSchema = z.object({
  providers: z.record(z.string(), ProviderHealthSchema),
});
export type AiHealth = z.infer<typeof AiHealthSchema>;

// Backoffice and API deploy independently; fields the screen already renders as
// "unknown" tolerate absence so an older API costs a blank cell, not the page.
// Identity and pricing stay strict — a silently zeroed price misinforms promotion.
export const CatalogModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().default(''),
  status: z.enum(CATALOG_MODEL_STATUSES),
  tier: z.enum(MODEL_TIERS),
  inputCostPerToken: z.number(),
  outputCostPerToken: z.number(),
  maxInputTokens: z.number(),
  maxOutputTokens: z.number().nullable().default(null),
  intelligenceIndex: z.number().nullable().default(null),
  upstreamCreatedAt: z.coerce.date().nullable().default(null),
  upstreamExpirationDate: z.coerce.date().nullable().default(null),
  lastSeenAt: z.coerce.date(),
  promotedAt: z.coerce.date().nullable().default(null),
});
export type CatalogModel = z.infer<typeof CatalogModelSchema>;

export const PaginatedCandidatesSchema = paginatedSchema(CatalogModelSchema);
export type PaginatedCandidates = z.infer<typeof PaginatedCandidatesSchema>;

export interface AiCatalogCandidatesParams {
  page: number;
  limit: number;
  search?: string;
}

export const CatalogAlertSchema = z.object({
  id: z.number().int(),
  modelId: z.string(),
  // Backoffice and API deploy independently; an alert kind this bundle predates
  // must reach the admin as an unknown badge, never take the whole page down.
  kind: z.string(),
  detail: z.string(),
  createdAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable().default(null),
});
export type CatalogAlert = z.infer<typeof CatalogAlertSchema>;

export const CatalogOverviewSchema = z.object({
  promoted: z.array(CatalogModelSchema),
  alerts: z.array(CatalogAlertSchema),
});
export type CatalogOverview = z.infer<typeof CatalogOverviewSchema>;

export const CatalogSyncResultSchema = z.object({
  status: z.enum(CATALOG_SYNC_STATUSES),
  // Same deploy-skew tolerance as the alert kind: a reason this bundle predates
  // must still render, and the counts already tell the admin what happened.
  skippedReason: z.string().nullable().default(null),
  upstream: z.number().int(),
  candidates: z.number().int(),
  alerts: z.number().int(),
  failures: z.number().int(),
});
export type CatalogSyncResult = z.infer<typeof CatalogSyncResultSchema>;
