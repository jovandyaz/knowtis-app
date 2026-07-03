export {
  interactionDetailsSchema,
  consentDecisionResultSchema,
  oauthGrantSchema,
  oauthGrantsResponseSchema,
} from './oauth.schemas';
export type {
  OauthInteractionDetails,
  ConsentDecisionResult,
  ConsentDecisionInput,
  OauthGrant,
  OauthGrantsResponse,
} from './oauth.schemas';

export {
  useOauthInteraction,
  useConsentDecision,
  oauthQueryKeys,
  useOauthGrants,
  useRevokeGrant,
  useConnectedAppsAvailable,
  oauthGrantsQueryKeys,
} from './oauth.hooks';

export { classifyConsentError, isOauthDisabledError } from './oauth.errors';
export type {
  ConsentDecisionError,
  ConsentDecisionErrorKind,
} from './oauth.errors';
