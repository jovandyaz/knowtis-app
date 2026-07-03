import { z } from 'zod';

export const interactionDetailsSchema = z.object({
  clientId: z.string(),
  clientName: z.string().nullable(),
  redirectHost: z.string(),
  scopes: z.array(z.string()),
  isCimdClient: z.boolean(),
});

export type OauthInteractionDetails = z.infer<typeof interactionDetailsSchema>;

export const consentDecisionResultSchema = z.object({
  // Drives a full-page window.location.assign — restrict to absolute http(s)
  // so a malformed backend/proxy value can never inject a javascript: URI.
  returnTo: z.httpUrl(),
});

export type ConsentDecisionResult = z.infer<typeof consentDecisionResultSchema>;

export type ConsentDecisionInput =
  | { action: 'approve'; approvedScopes: string[] }
  | { action: 'deny' };

export const oauthGrantSchema = z.object({
  grantId: z.string(),
  clientId: z.string(),
  clientName: z.string().nullable(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
});

export type OauthGrant = z.infer<typeof oauthGrantSchema>;

export const oauthGrantsResponseSchema = z.object({
  grants: z.array(oauthGrantSchema),
});

export type OauthGrantsResponse = z.infer<typeof oauthGrantsResponseSchema>;
