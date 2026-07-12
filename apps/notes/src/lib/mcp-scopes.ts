/**
 * Human-readable i18n keys for the MCP/OAuth scopes. Raw scope strings
 * (`notes:read`) are protocol wire values, never user-facing copy.
 */
export const SCOPE_LABEL_KEYS: Record<string, string> = {
  'notes:read': 'oauth.scopes.notesRead',
  'notes:write': 'oauth.scopes.notesWrite',
  'notes:share': 'oauth.scopes.notesShare',
  offline_access: 'oauth.scopes.offlineAccess',
};
