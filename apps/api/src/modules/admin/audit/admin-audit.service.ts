import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
  type AuditPage,
  type NewAdminAuditEntry,
} from './domain/admin-audit.repository';

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly repository: AdminAuditRepository
  ) {}

  /** Audit failures must never roll back the admin action they describe —
   *  a missing audit row is an operational alert, not a user-facing error. */
  async record(entry: NewAdminAuditEntry): Promise<void> {
    try {
      await this.repository.insert(entry);
    } catch (error) {
      this.logger.error(
        `Failed to record audit entry '${entry.action}' on ${entry.targetType}${entry.targetId ? ` ${entry.targetId}` : ''} by ${entry.actorId}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  async findPaginated(params: {
    page: number;
    limit: number;
  }): Promise<AuditPage> {
    return this.repository.findPaginated(params);
  }
}
