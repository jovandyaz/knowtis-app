export {
  ApiClientError,
  HttpClient,
  httpClient,
  isEmailNotVerifiedError,
  retryAfterMsOf,
  type FieldError,
  type IHttpClient,
  type TokenProvider,
} from './lib/http-client';

export {
  notesApi,
  type NoteWithAccess,
  type NoteDetail,
  type NoteCollaborator,
  type NoteCounts,
  type SupertagCatalog,
} from './lib/notes.api';

export { organizationApi } from './lib/organization.api';
export { tagsApi, type UpdateTagInput } from './lib/tags.api';

export { aiClient, AIClient } from './lib/ai.client';
export type {
  AICompletePayload,
  AIErrorPayload,
  AIStreamHandle,
  AuthRefreshHandler,
} from './lib/ai.client';

export { agentClient, AgentClient } from './lib/agent.client';
export type {
  AgentSource,
  WebSource,
  AgentChunkPayload,
  AgentThinkingPayload,
  AgentDonePayload,
  AgentErrorPayload,
  AgentStreamHandle,
  AgentProposalPayload,
  AgentCommittedPayload,
} from './lib/agent.client';

export { deriveWsBaseUrl } from './lib/ws-url';

export {
  AUTH_REFRESH_LOCK,
  refreshSessionTokens,
  withAuthRefreshLock,
} from './lib/session-refresh';

export {
  classifyRefreshFailure,
  type RefreshFailure,
} from './lib/refresh-failure';

export { createTokenRefreshPolicy } from './lib/token-refresh-policy';
export type {
  RefreshOutcome,
  TokenRefreshPolicy,
  TokenRefreshHandlers,
} from './lib/token-refresh-policy';

export {
  usersApi,
  type UserProfile,
  type UpdateProfileInput,
} from './lib/users.api';

export {
  mcpKeysApi,
  type McpApiKey,
  type CreateMcpKeyInput,
  type CreateMcpKeyResponse,
} from './lib/mcp-keys.api';

export { oauthApi } from './lib/oauth.api';

export {
  artifactsApi,
  type GenerateArtifactInput,
  type ReviewCardInput,
  type SubmitQuizInput,
} from './lib/artifacts.api';

export {
  imagesApi,
  type UploadImageArgs,
  type UploadImageResponse,
} from './lib/images.api';

export { aiModelsApi } from './lib/ai-models.api';
export { aiKeysApi } from './lib/ai-keys.api';
