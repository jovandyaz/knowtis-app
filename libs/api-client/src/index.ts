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

export { collaborationClient } from './lib/collaboration.client';

export { aiClient } from './lib/ai.client';
export type {
  AICompletePayload,
  AIErrorPayload,
  AIStreamHandle,
} from './lib/ai.client';

export {
  usersApi,
  type UserProfile,
  type UpdateProfileInput,
} from './lib/users.api';
