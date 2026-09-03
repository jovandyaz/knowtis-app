import { Controller, Get, Inject, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

import { RSS_LIMIT_BYTES } from './container-memory-limit';
import { DbHealthIndicator } from './db-health.indicator';
import { HealthCheckExceptionFilter } from './health-check-exception.filter';

const indicatorStatus = {
  type: 'object' as const,
  properties: { status: { type: 'string', example: 'up' } },
};

const fullHealthSchema = {
  type: 'object' as const,
  properties: {
    status: { type: 'string', example: 'ok' },
    info: {
      type: 'object' as const,
      properties: {
        database: indicatorStatus,
        memory_rss: indicatorStatus,
      },
    },
    error: { type: 'object' },
    details: { type: 'object' },
  },
};

const readinessSchema = {
  type: 'object' as const,
  properties: {
    status: { type: 'string', example: 'ok' },
    info: {
      type: 'object' as const,
      properties: {
        database: indicatorStatus,
      },
    },
    error: { type: 'object' },
    details: { type: 'object' },
  },
};

const pingSchema = {
  type: 'object' as const,
  properties: {
    status: { type: 'string', example: 'ok' },
    timestamp: {
      type: 'string',
      format: 'date-time',
      example: '2024-01-15T10:30:00.000Z',
    },
  },
};

@ApiTags('Health')
@Controller('health')
@UseFilters(HealthCheckExceptionFilter)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly db: DbHealthIndicator,
    @Inject(RSS_LIMIT_BYTES) private readonly rssLimitBytes: number
  ) {}

  @ApiOperation({
    summary: 'Full health check',
    description:
      'Checks database connectivity and resident memory against 90% of the container memory limit.',
  })
  @ApiResponse({
    status: 200,
    description: 'All health indicators are healthy',
    schema: fullHealthSchema,
  })
  @ApiResponse({
    status: 503,
    description:
      'One or more indicators are down; the body is the Terminus result naming them',
  })
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.memory.checkRSS('memory_rss', this.rssLimitBytes),
    ]);
  }

  @ApiOperation({
    summary: 'Simple ping',
    description:
      'Returns a simple OK response with a timestamp. No dependency checks.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is reachable',
    schema: pingSchema,
  })
  @Get('ping')
  ping() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @ApiOperation({
    summary: 'Readiness check',
    description:
      'Checks database connectivity. Returns 503 when the database is unreachable.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is ready to accept requests',
    schema: readinessSchema,
  })
  @ApiResponse({
    status: 503,
    description: 'Service is not ready — database is unreachable',
  })
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.isHealthy('database')]);
  }
}
