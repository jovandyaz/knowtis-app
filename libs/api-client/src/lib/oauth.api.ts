import { httpClient } from './http-client';

/**
 * OAuth interaction details for the hosted consent screen, as returned by
 * `GET /oauth/interactions/:uid`. Public (no auth): a 404 means the uid is
 * unknown/expired or the MCP OAuth flag is off.
 */
export interface OauthInteractionDetails {
  clientId: string;
  clientName: string | null;
  redirectHost: string;
  scopes: string[];
  isCimdClient: boolean;
}

/**
 * Completion result carrying the AS `returnTo` URL. The caller MUST navigate to
 * it full-page — the path-scoped `resume` cookie only rides a real navigation.
 */
export interface ConsentDecisionResult {
  returnTo: string;
}

export const oauthApi = {
  async getInteraction(uid: string): Promise<OauthInteractionDetails> {
    return httpClient.get<OauthInteractionDetails>(
      `/oauth/interactions/${encodeURIComponent(uid)}`
    );
  },

  async confirm(
    uid: string,
    approvedScopes: string[]
  ): Promise<ConsentDecisionResult> {
    return httpClient.post<ConsentDecisionResult>(
      `/oauth/interactions/${encodeURIComponent(uid)}/confirm`,
      { approvedScopes }
    );
  },

  async abort(uid: string): Promise<ConsentDecisionResult> {
    return httpClient.post<ConsentDecisionResult>(
      `/oauth/interactions/${encodeURIComponent(uid)}/abort`
    );
  },
};
