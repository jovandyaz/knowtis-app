import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';

import {
  adminAuditLog,
  DATABASE_CONNECTION,
  users,
  type Database,
} from '../../../../../database';
import type {
  AdminAuditRepository,
  AuditPage,
  NewAdminAuditEntry,
} from '../../domain/admin-audit.repository';

@Injectable()
export class DrizzleAdminAuditRepository implements AdminAuditRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async insert(entry: NewAdminAuditEntry): Promise<void> {
    await this.db
      .insert(adminAuditLog)
      .values({
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
      })
      .returning({ id: adminAuditLog.id });
  }

  async findPaginated(params: {
    page: number;
    limit: number;
  }): Promise<AuditPage> {
    const offset = (params.page - 1) * params.limit;
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: adminAuditLog.id,
          actorId: adminAuditLog.actorId,
          actorEmail: users.email,
          action: adminAuditLog.action,
          targetType: adminAuditLog.targetType,
          targetId: adminAuditLog.targetId,
          before: adminAuditLog.before,
          after: adminAuditLog.after,
          createdAt: adminAuditLog.createdAt,
        })
        .from(adminAuditLog)
        .leftJoin(users, eq(adminAuditLog.actorId, users.id))
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(params.limit)
        .offset(offset),
      this.db.select({ value: count() }).from(adminAuditLog),
    ]);

    return {
      items: rows.map((row) => ({
        ...row,
        actorEmail: row.actorEmail ?? null,
        before: row.before ?? null,
        after: row.after ?? null,
      })),
      total: totals[0]?.value ?? 0,
    };
  }
}
