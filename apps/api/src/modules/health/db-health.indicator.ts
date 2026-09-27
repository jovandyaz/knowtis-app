import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';

import { reasonOf } from '../../core/errors/reason-of';
import {
  DATABASE_CONNECTION,
  type Database,
} from '../../database/database.module';

@Injectable()
export class DbHealthIndicator {
  private readonly logger = new Logger(DbHealthIndicator.name);

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(DATABASE_CONNECTION) private readonly db: Database
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.db.execute(sql`SELECT 1`);
      return indicator.up();
    } catch (error) {
      this.logger.error(`Database health check failed: ${reasonOf(error)}`);
      return indicator.down({ message: 'Database unreachable' });
    }
  }
}
