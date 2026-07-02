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

export { classifyConsentError } from './oauth.errors';
export type {
  ConsentDecisionError,
  ConsentDecisionErrorKind,
} from './oauth.errors';
