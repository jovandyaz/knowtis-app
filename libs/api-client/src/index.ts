export {
  ApiClientError,
  HttpClient,
  httpClient,
  type FieldError,
  type IHttpClient,
  type TokenProvider,
} from './lib/http-client';

export {
  notesApi,
  type NoteWithAccess,
  type NoteCollaborator,
} from './lib/notes.api';

export { aiClient, AIClient } from './lib/ai.client';
export type {
  AICompletePayload,
  AIErrorPayload,
  AIStreamHandle,
  AuthRefreshHandler,
} from './lib/ai.client';

export { createTokenRefreshPolicy } from './lib/token-refresh-policy';
export type {
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

export {
  artifactsApi,
  type GenerateArtifactInput,
  type ReviewCardInput,
  type SubmitQuizInput,
} from './lib/artifacts.api';
