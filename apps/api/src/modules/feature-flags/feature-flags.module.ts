import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';

import { AdminAuditModule } from '../admin/audit/admin-audit.module';
import { FEATURE_FLAG_REPOSITORY } from './domain/feature-flag.repository';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { DrizzleFeatureFlagRepository } from './infrastructure/drizzle-feature-flag.repository';

@Global()
@Module({
  imports: [CacheModule.register(), AdminAuditModule],
  controllers: [FeatureFlagsController],
  providers: [
    FeatureFlagsService,
    FeatureFlagGuard,
    {
      provide: FEATURE_FLAG_REPOSITORY,
      useClass: DrizzleFeatureFlagRepository,
    },
  ],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
