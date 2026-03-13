import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

import { DbHealthIndicator } from './db-health.indicator';

const indicatorStatus = {
  type: 'object' as const,
  properties: { status: { type: 'string', example: 'up' } },
};

const memoryHealthSchema = {
  type: 'object' as const,
  properties: {
    status: { type: 'string', example: 'ok' },
    info: {
      type: 'object' as const,
      properties: {
        memory_heap: indicatorStatus,
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
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly db: DbHealthIndicator
  ) {}

  @ApiOperation({
    summary: 'Full health check',
    description: 'Checks memory heap and RSS usage against configured limits.',
  })
  @ApiResponse({
    status: 200,
    description: 'All health indicators are healthy',
    schema: memoryHealthSchema,
  })
  @ApiResponse({
    status: 503,
    description: 'One or more health indicators are unhealthy',
  })
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),
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
