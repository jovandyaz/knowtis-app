import type { RequestUser } from '@jovandyaz/auth/server';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { ANONYMOUS_LIMITS } from '@knowtis/shared-types';

import { DATABASE_CONNECTION, type Database } from '../../../database';
import { notes } from '../../../database/schema/notes.schema';

@Injectable()
export class AnonymousNoteLimitGuard implements CanActivate {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser;

    if (!user?.isAnonymous) {
      return true;
    }

    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notes)
      .where(eq(notes.ownerId, user.id));

    if (result[0].count >= ANONYMOUS_LIMITS.maxNotes) {
      throw new ForbiddenException({
        code: 'ANONYMOUS_NOTE_LIMIT',
        message: `Anonymous users can create up to ${ANONYMOUS_LIMITS.maxNotes} notes. Sign up for unlimited notes.`,
        limit: ANONYMOUS_LIMITS.maxNotes,
      });
    }

    return true;
  }
}
