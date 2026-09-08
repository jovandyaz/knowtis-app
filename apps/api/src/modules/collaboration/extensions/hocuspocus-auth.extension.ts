import type { Extension } from '@hocuspocus/server';
import { USER_ROLE } from '@jovandyaz/auth';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  defineAbilityFor,
  SUBJECTS,
  type AppAbility,
  type AuthUser,
  type SharedNote,
} from '@knowtis/authorization';
import { HANDSHAKE_FAILURE } from '@knowtis/shared-types';

import { TOKEN_SOURCE_MCP, type McpTokenClaims } from '../../mcp/mcp-token';
import {
  resolveEffectiveAccess,
  type AccessSnapshot,
  type SessionIdentity,
} from '../../notes/domain/access-policy';
import {
  ACCESS_SNAPSHOT_REPOSITORY,
  type AccessSnapshotRepository,
} from '../../notes/domain/ports/access-snapshot.repository';
import { shareTokenFingerprint } from '../../notes/domain/share-token-fingerprint';
import { UsersService } from '../../users/users.service';
import {
  MAX_TIMER_DELAY_MS,
  TOKEN_EXPIRY_GRACE_MS,
} from '../../websocket/socket-expiry';
import { HandshakeError } from '../handshake-error';

type AuthenticatedUser = Awaited<ReturnType<UsersService['findById']>>;

interface JwtPayload extends McpTokenClaims {
  sub: string;
  email: string;
  isAnonymous?: boolean;
  exp?: number;
}

export interface HocuspocusAuthContext {
  user: AuthUser;
  noteId: string;
  identity: SessionIdentity;
  tokenExpiresAtMs?: number;
}

@Injectable()
export class HocuspocusAuthExtension {
  private readonly logger = new Logger(HocuspocusAuthExtension.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    @Inject(ACCESS_SNAPSHOT_REPOSITORY)
    private readonly accessRepository: AccessSnapshotRepository
  ) {}

  toExtension(): Extension<HocuspocusAuthContext> {
    // Bind once so Hocuspocus' callbacks (which lose `this`) can still reach
    // the instance methods + injected dependencies.
    const authenticate = this.authenticate.bind(this);
    const armExpiryDisconnect = this.armExpiryDisconnect.bind(this);

    return {
      priority: 100,
      extensionName: 'KnowtisAuth',

      async onAuthenticate({
        token,
        documentName,
        connectionConfig,
        requestParameters,
      }) {
        return authenticate({
          token,
          documentName,
          connectionConfig,
          requestParameters,
        });
      },

      async connected({ context, connection }) {
        armExpiryDisconnect(context, connection);
      },
    };
  }

  private armExpiryDisconnect(
    context: HocuspocusAuthContext,
    connection: {
      close: (event?: { code: number; reason: string }) => void;
      onClose: (callback: () => void) => unknown;
    }
  ): void {
    if (context.tokenExpiresAtMs === undefined) {
      return;
    }
    const delay = context.tokenExpiresAtMs + TOKEN_EXPIRY_GRACE_MS - Date.now();
    if (delay > MAX_TIMER_DELAY_MS) {
      return;
    }
    const timer = setTimeout(
      () => {
        this.logger.log(
          `Closing collaboration connection for note ${context.noteId}: token expired`
        );
        connection.close({ code: 4401, reason: 'Token expired' });
      },
      Math.max(delay, 0)
    );
    timer.unref?.();
    connection.onClose(() => clearTimeout(timer));
  }

  private async authenticate(params: {
    token: string;
    documentName: string;
    connectionConfig: { readOnly: boolean };
    requestParameters?: URLSearchParams;
  }): Promise<HocuspocusAuthContext> {
    const { token, documentName, connectionConfig, requestParameters } = params;

    const { user, tokenExpiresAtMs } = await this.loadAuthenticatedUser(
      token,
      documentName
    );

    let snapshot: AccessSnapshot | null;
    try {
      snapshot = await this.accessRepository.findAccessSnapshot(documentName);
      if (!snapshot) {
        throw new HandshakeError(HANDSHAKE_FAILURE.NOTE_NOT_FOUND);
      }
    } catch (error) {
      // A missing note is an intentional verdict and is re-thrown verbatim;
      // unexpected DB/repo failures are normalised so the raw error message
      // (which may include connection strings, SQL, table names) is never
      // delivered as the WebSocket close reason.
      if (error instanceof HandshakeError) {
        throw error;
      }
      this.logger.error(
        `Internal error during auth for note ${documentName}`,
        error instanceof Error ? error.stack : error
      );
      throw new HandshakeError(HANDSHAKE_FAILURE.INTERNAL_ERROR);
    }

    const identity: SessionIdentity = {
      userId: user.id,
      suppliedTokenFingerprint: shareTokenFingerprint(
        requestParameters?.get('shareToken') ?? null
      ),
    };
    const effective = resolveEffectiveAccess(snapshot, identity);
    if (effective === 'none' && user.role !== USER_ROLE.ADMIN) {
      throw new HandshakeError(HANDSHAKE_FAILURE.FORBIDDEN);
    }
    const sharedNotes: SharedNote[] =
      effective === 'viewer' || effective === 'editor'
        ? [{ noteId: documentName, permission: effective }]
        : [];
    const authUser = this.toAuthUser(user);
    const ability = defineAbilityFor(authUser, { sharedNotes });
    this.enforcePermissions(
      ability,
      {
        id: documentName,
        ownerId: snapshot.ownerId,
        generalAccess: snapshot.generalAccess,
      },
      connectionConfig
    );

    return {
      user: authUser,
      identity,
      noteId: documentName,
      ...(tokenExpiresAtMs !== undefined && { tokenExpiresAtMs }),
    };
  }

  private async loadAuthenticatedUser(
    token: string,
    documentName: string
  ): Promise<{ user: AuthenticatedUser; tokenExpiresAtMs?: number }> {
    if (!token) {
      throw new HandshakeError(HANDSHAKE_FAILURE.AUTH_REQUIRED);
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch (error) {
      this.logger.warn(
        `Invalid JWT token for note ${documentName}: ${error instanceof Error ? error.message : error}`
      );
      throw new HandshakeError(HANDSHAKE_FAILURE.INVALID_TOKEN);
    }

    if (payload.source === TOKEN_SOURCE_MCP) {
      this.logger.warn(
        `MCP token rejected for collaboration handshake on note ${documentName}`
      );
      throw new HandshakeError(HANDSHAKE_FAILURE.FORBIDDEN);
    }

    let user: AuthenticatedUser | null;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch (error) {
      this.logger.error(
        `Failed to load user ${payload.sub} during auth for note ${documentName}`,
        error instanceof Error ? error.stack : error
      );
      throw new HandshakeError(HANDSHAKE_FAILURE.INVALID_TOKEN);
    }
    if (!user) {
      throw new HandshakeError(HANDSHAKE_FAILURE.INVALID_TOKEN);
    }
    return {
      user,
      ...(typeof payload.exp === 'number' && {
        tokenExpiresAtMs: payload.exp * 1000,
      }),
    };
  }

  private toAuthUser(user: AuthenticatedUser): AuthUser {
    return {
      id: user.id,
      isAnonymous: user.isAnonymous ?? false,
      ...(user.role ? { role: user.role } : {}),
    };
  }

  private enforcePermissions(
    ability: AppAbility,
    note: {
      id: string;
      ownerId: string;
      generalAccess: AccessSnapshot['generalAccess'];
    },
    connectionConfig: { readOnly: boolean }
  ): void {
    const noteSubject = {
      __typename: SUBJECTS.Note,
      id: note.id,
      ownerId: note.ownerId,
      generalAccess: note.generalAccess,
    } as const;

    if (!ability.can('read', noteSubject)) {
      throw new HandshakeError(HANDSHAKE_FAILURE.FORBIDDEN);
    }

    if (!ability.can('update', noteSubject)) {
      connectionConfig.readOnly = true;
    }
  }
}
