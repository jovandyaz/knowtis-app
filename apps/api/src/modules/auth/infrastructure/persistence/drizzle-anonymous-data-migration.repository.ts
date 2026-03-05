import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  aiUsage,
  DATABASE_CONNECTION,
  notes,
  users,
  type Database,
} from '../../../../database';

@Injectable()
export class DrizzleAnonymousDataMigrationRepository {
  private readonly logger = new Logger(
    DrizzleAnonymousDataMigrationRepository.name
  );

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async migrateAnonymousData(
    anonymousUserId: string,
    registeredUserId: string
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [anonUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, anonymousUserId), eq(users.isAnonymous, true)))
        .limit(1);

      if (!anonUser) {
        throw new BadRequestException('Source user is not an anonymous user');
      }

      await tx
        .update(notes)
        .set({ ownerId: registeredUserId })
        .where(eq(notes.ownerId, anonymousUserId));

      await tx
        .update(aiUsage)
        .set({ userId: registeredUserId })
        .where(eq(aiUsage.userId, anonymousUserId));

      await tx.delete(users).where(eq(users.id, anonymousUserId));

      this.logger.log(
        `Migrated anonymous data from ${anonymousUserId} to ${registeredUserId}`
      );
    });
  }
}
