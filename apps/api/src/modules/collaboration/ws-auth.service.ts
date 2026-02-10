import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import type {
  AnonymousWsUser,
  AuthenticatedWsUser,
  WsUser,
} from './collaboration.types';

@Injectable()
export class WsAuthService {
  private readonly logger = new Logger(WsAuthService.name);

  constructor(private readonly jwtService: JwtService) {}

  extractUser(client: Socket): WsUser {
    const token = this.extractToken(client);

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
        return authenticatedUser;
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
    return anonymousUser;
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
}
