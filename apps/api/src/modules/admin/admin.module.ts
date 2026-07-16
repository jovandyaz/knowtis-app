import { Module } from '@nestjs/common';

import { AIModule } from '../ai';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { AdminAuditModule } from './audit/admin-audit.module';

@Module({
  imports: [UsersModule, AIModule, AdminAuditModule],
  controllers: [AdminController],
})
export class AdminModule {}
