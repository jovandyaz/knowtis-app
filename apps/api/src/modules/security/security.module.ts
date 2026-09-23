import { Module } from '@nestjs/common';

import { CspReportsController } from './csp-reports.controller';

@Module({
  controllers: [CspReportsController],
})
export class SecurityModule {}
