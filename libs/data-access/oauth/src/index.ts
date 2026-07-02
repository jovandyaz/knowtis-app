export {
  interactionDetailsSchema,
  consentDecisionResultSchema,
} from './oauth.schemas';
export type {
  OauthInteractionDetails,
  ConsentDecisionResult,
  ConsentDecisionInput,
} from './oauth.schemas';

export {
  useOauthInteraction,
  useConsentDecision,
  oauthQueryKeys,
} from './oauth.hooks';
