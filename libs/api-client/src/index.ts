export { HttpClient, ApiClientError, httpClient } from './lib/http-client';
export { tokenStorage } from './lib/token-storage';

export {
  notesApi,
  type NoteWithAccess,
  type NotesQueryParams,
  type NoteCollaborator,
} from './lib/notes.api';

export {
  CollaborationClient,
  collaborationClient,
  type CollaborationConnectOptions,
} from './lib/collaboration.client';

export {
  DEFAULT_API_CONFIG,
  STORAGE_KEYS,
  type ApiClientConfig,
} from './lib/config';
