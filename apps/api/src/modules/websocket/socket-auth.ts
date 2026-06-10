import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import { TOKEN_SOURCE_MCP, type McpTokenClaims } from '../mcp/mcp-token';

export interface AuthenticatedSocket extends Socket {
  data: { userId?: string; isAnonymous?: boolean };
}

export type SocketAuthFailureReason =
  | 'missing_token'
  | 'invalid_token'
  | 'mcp_token';

export type SocketAuthResult =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: SocketAuthFailureReason };

const FAILURE_MESSAGES: Record<SocketAuthFailureReason, string | undefined> = {
  missing_token: undefined,
  invalid_token: 'Invalid authentication token',
  mcp_token: 'MCP tokens are not allowed on this namespace',
};

/** Message for AIErrors.authRequired; undefined keeps that factory's default. */
export function socketAuthFailureMessage(
  reason: SocketAuthFailureReason
): string | undefined {
  return FAILURE_MESSAGES[reason];
}

/**
 * Verifies the handshake JWT, rejects MCP-source tokens, and sets
 * client.data.userId/isAnonymous on success. Fully synchronous on purpose:
 * userId must be set before any awaited work in handleConnection, so a
 * message emitted on the same tick as `connect` can't race ahead of it.
 */
export function authenticateSocket(
  client: AuthenticatedSocket,
  jwtService: JwtService,
  logger: Logger,
  eventPrefix: string
): SocketAuthResult {
  const authToken: unknown = client.handshake.auth?.['token'];
  const token =
    typeof authToken === 'string' && authToken
      ? authToken
      : client.handshake.headers?.['authorization']?.replace('Bearer ', '');
  if (!token) {
    return { ok: false, reason: 'missing_token' };
  }
  try {
    const payload = jwtService.verify<
      { sub: string; isAnonymous?: boolean } & McpTokenClaims
    >(token);
    if (payload.source === TOKEN_SOURCE_MCP) {
      logger.warn({
        event: `${eventPrefix}.client.mcp_token_rejected`,
        clientId: client.id,
        userId: payload.sub,
      });
      return { ok: false, reason: 'mcp_token' };
    }
    client.data.userId = payload.sub;
    if (payload.isAnonymous) {
      client.data.isAnonymous = true;
    }
    logger.log({
      event: `${eventPrefix}.client.connected`,
      clientId: client.id,
      userId: payload.sub,
    });
    return { ok: true, userId: payload.sub };
  } catch {
    logger.warn({
      event: `${eventPrefix}.client.auth_failed`,
      clientId: client.id,
    });
    return { ok: false, reason: 'invalid_token' };
  }
}
