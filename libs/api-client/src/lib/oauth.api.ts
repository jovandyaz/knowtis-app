import { httpClient } from './http-client';

/**
 * Transport for the hosted OAuth consent screen. Responses are returned raw and
 * validated with Zod in `@knowtis/data-access-oauth` — the single source of the
 * interaction/decision shapes. A 404 from `getInteraction` means the uid is
 * unknown/expired or the MCP OAuth flag is off.
 */
export const oauthApi = {
  getInteraction(uid: string): Promise<unknown> {
    return httpClient.get(`/oauth/interactions/${encodeURIComponent(uid)}`);
  },

  confirm(uid: string, approvedScopes: string[]): Promise<unknown> {
    return httpClient.post(
      `/oauth/interactions/${encodeURIComponent(uid)}/confirm`,
      { approvedScopes }
    );
  },

  abort(uid: string): Promise<unknown> {
    return httpClient.post(
      `/oauth/interactions/${encodeURIComponent(uid)}/abort`
    );
  },

  getGrants(): Promise<unknown> {
    return httpClient.get('/oauth/grants');
  },

  revokeGrant(grantId: string): Promise<void> {
    return httpClient.delete(`/oauth/grants/${encodeURIComponent(grantId)}`);
  },
};
