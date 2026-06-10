import type { Extension } from '@hocuspocus/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  defineAbilityFor,
  SUBJECTS,
  type AppAbility,
  type AuthUser,
  type SharedNote,
} from '@knowtis/authorization';
import { GENERAL_ACCESS, type PermissionLevel } from '@knowtis/shared-types';

import { TOKEN_SOURCE_MCP, type McpTokenClaims } from '../../mcp/mcp-token';
import { NOTE_REPOSITORY } from '../../notes/domain';
import type { NoteRepository } from '../../notes/domain';
import type { NoteEntity } from '../../notes/domain/entities/note.entity';
import { UsersService } from '../../users/users.service';
import {
  MAX_TIMER_DELAY_MS,
  TOKEN_EXPIRY_GRACE_MS,
} from '../../websocket/socket-expiry';

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
  tokenExpiresAtMs?: number;
}

@Injectable()
export class HocuspocusAuthExtension {
  private readonly logger = new Logger(HocuspocusAuthExtension.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    @Inject(NOTE_REPOSITORY)
    private readonly noteRepository: NoteRepository
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

    let note: NoteEntity;
    let rawPermissions: Awaited<
      ReturnType<NoteRepository['findPermissionsByNote']>
    >;
    try {
      [note, rawPermissions] = await Promise.all([
        this.loadNote(documentName),
        this.noteRepository.findPermissionsByNote(documentName),
      ]);
    } catch (error) {
      // Throws like "Note not found" are intentional and re-thrown verbatim;
      // unexpected DB/repo failures are normalised so the raw error message
      // (which may include connection strings, SQL, table names) is never
      // delivered as the WebSocket close reason.
      if (error instanceof Error && error.message === 'Note not found') {
        throw error;
      }
      this.logger.error(
        `Internal error during auth for note ${documentName}`,
        error instanceof Error ? error.stack : error
      );
      throw new Error('Internal server error');
    }

    const sharedNotes = this.buildSharedNotes(
      rawPermissions,
      user.id,
      note,
      requestParameters?.get('shareToken') ?? null
    );

    const authUser = this.toAuthUser(user);
    const ability = defineAbilityFor(authUser, { sharedNotes });
    this.enforcePermissions(ability, note, connectionConfig);

    return {
      user: authUser,
      noteId: documentName,
      ...(tokenExpiresAtMs !== undefined && { tokenExpiresAtMs }),
    };
  }

  private async loadAuthenticatedUser(
    token: string,
    documentName: string
  ): Promise<{ user: AuthenticatedUser; tokenExpiresAtMs?: number }> {
    if (!token) {
      throw new Error('Authentication required');
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
      throw new Error('Invalid token');
    }

    if (payload.source === TOKEN_SOURCE_MCP) {
      this.logger.warn(
        `MCP token rejected for collaboration handshake on note ${documentName}`
      );
      throw new Error('Forbidden');
    }

    let user: AuthenticatedUser | null;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch (error) {
      this.logger.error(
        `Failed to load user ${payload.sub} during auth for note ${documentName}`,
        error instanceof Error ? error.stack : error
      );
      throw new Error('Invalid token');
    }
    if (!user) {
      throw new Error('Invalid token');
    }
    return {
      user,
      ...(typeof payload.exp === 'number' && {
        tokenExpiresAtMs: payload.exp * 1000,
      }),
    };
  }

  private async loadNote(documentName: string): Promise<NoteEntity> {
    const note = await this.noteRepository.findById(documentName);
    if (!note) {
      throw new Error('Note not found');
    }
    return note;
  }

  /**
   * Builds the SharedNote list used by CASL to evaluate per-note permissions.
   * Combines (a) explicit collaborator entries from the DB filtered to the
   * current user, and (b) a synthetic entry derived from a valid `shareToken`
   * URL parameter — keeping a single permission-evaluation code path.
   */
  private buildSharedNotes(
    permissions: Awaited<ReturnType<NoteRepository['findPermissionsByNote']>>,
    userId: string,
    note: NoteEntity,
    shareTokenParam: string | null
  ): SharedNote[] {
    const sharedNotes: SharedNote[] = permissions
      .filter((entry) => entry.permission.userId === userId)
      .map((entry) => ({
        noteId: entry.permission.noteId,
        permission: entry.permission.permission.value as PermissionLevel,
      }));

    if (
      shareTokenParam &&
      note.generalAccess === GENERAL_ACCESS.ANYONE_WITH_LINK &&
      note.shareToken === shareTokenParam
    ) {
      sharedNotes.push({
        noteId: note.id,
        permission: note.generalAccessPermission as PermissionLevel,
      });
    }

    return sharedNotes;
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
    note: NoteEntity,
    connectionConfig: { readOnly: boolean }
  ): void {
    const noteSubject = {
      __typename: SUBJECTS.Note,
      id: note.id,
      ownerId: note.ownerId,
      generalAccess: note.generalAccess,
    } as const;

    if (!ability.can('read', noteSubject)) {
      throw new Error('Forbidden');
    }

    if (!ability.can('update', noteSubject)) {
      connectionConfig.readOnly = true;
    }
  }
}
