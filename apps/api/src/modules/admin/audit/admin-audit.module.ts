import { Module } from '@nestjs/common';

import { AdminAuditService } from './admin-audit.service';
import { ADMIN_AUDIT_REPOSITORY } from './domain/admin-audit.repository';
import { DrizzleAdminAuditRepository } from './infrastructure/persistence/drizzle-admin-audit.repository';

@Module({
  providers: [
    AdminAuditService,
    { provide: ADMIN_AUDIT_REPOSITORY, useClass: DrizzleAdminAuditRepository },
  ],
  exports: [AdminAuditService],
})
export class AdminAuditModule {}
