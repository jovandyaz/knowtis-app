import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import type {
  AnonymousWsUser,
  AuthenticatedWsUser,
  WsAuthResult,
} from './collaboration.types';

@Injectable()
export class WsAuthService {
  private readonly logger = new Logger(WsAuthService.name);

  constructor(private readonly jwtService: JwtService) {}

  extractUser(client: Socket): WsAuthResult {
    const token = this.extractToken(client);
    const shareToken = this.extractShareToken(client);
    const tokenSpread = shareToken ? { shareToken } : {};

    if (token) {
      try {
        const payload = this.jwtService.verify<{ sub: string; email: string }>(
          token
        );
        const authenticatedUser: AuthenticatedWsUser = {
          type: 'authenticated',
          userId: payload.sub,
          email: payload.email,
        };
        this.logger.debug(`Authenticated WebSocket user: ${payload.email}`);
        return { user: authenticatedUser, ...tokenSpread };
      } catch (error) {
        this.logger.warn(
          `Invalid JWT token, treating as anonymous: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    const anonymousUser: AnonymousWsUser = {
      type: 'anonymous',
      odUserId: `anon-${client.id}`,
    };
    this.logger.debug(`Anonymous WebSocket user: ${anonymousUser.odUserId}`);
    return { user: anonymousUser, ...tokenSpread };
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.['token'] as string | undefined;
    if (authToken) {
      return authToken;
    }

    const authHeader = client.handshake.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  private extractShareToken(client: Socket): string | undefined {
    const authShareToken = client.handshake.auth?.['shareToken'] as
      | string
      | undefined;
    if (authShareToken) {
      return authShareToken;
    }

    const queryShareToken = client.handshake.query?.['shareToken'] as
      | string
      | undefined;
    if (queryShareToken) {
      return queryShareToken;
    }

    return undefined;
  }
}
