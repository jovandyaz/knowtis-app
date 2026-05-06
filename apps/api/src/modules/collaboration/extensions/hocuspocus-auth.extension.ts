import type { Extension } from '@hocuspocus/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  defineAbilityFor,
  SUBJECTS,
  type AuthUser,
  type SharedNote,
} from '@knowtis/authorization';
import type { PermissionLevel } from '@knowtis/shared-types';

import { NOTE_REPOSITORY } from '../../notes/domain';
import type { NoteRepository } from '../../notes/domain';
import { UsersService } from '../../users/users.service';

interface JwtPayload {
  sub: string;
  email: string;
  isAnonymous?: boolean;
}

export interface HocuspocusAuthContext {
  user: AuthUser;
  noteId: string;
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
    const jwtService = this.jwtService;
    const usersService = this.usersService;
    const noteRepository = this.noteRepository;
    const logger = this.logger;

    return {
      priority: 100,
      extensionName: 'KnowtisAuth',

      async onAuthenticate({ token, documentName, connectionConfig }) {
        if (!token) {
          throw new Error('Authentication required');
        }

        let payload: JwtPayload;
        try {
          payload = jwtService.verify<JwtPayload>(token);
        } catch (error) {
          logger.warn(
            `Invalid JWT token for note ${documentName}: ${error instanceof Error ? error.message : error}`
          );
          throw new Error('Invalid token');
        }

        const user = await usersService.findById(payload.sub);
        if (!user) {
          throw new Error('Invalid token');
        }

        const note = await noteRepository.findById(documentName);
        if (!note) {
          throw new Error('Note not found');
        }

        const permissions =
          await noteRepository.findPermissionsByNote(documentName);
        const sharedNotes: SharedNote[] = permissions
          .filter((entry) => entry.permission.userId === user.id)
          .map((entry) => ({
            noteId: entry.permission.noteId,
            permission: entry.permission.permission.value as PermissionLevel,
          }));

        const authUser: AuthUser = {
          id: user.id,
          isAnonymous: user.isAnonymous ?? false,
          ...(user.role ? { role: user.role } : {}),
        };

        const ability = defineAbilityFor(authUser, { sharedNotes });

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

        return { user: authUser, noteId: documentName };
      },
    };
  }
}
