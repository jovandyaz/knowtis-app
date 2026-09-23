import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { groupCspViolations, readCspViolations } from './csp-violation';

const CSP_VIOLATION_EVENT = 'security.csp.violation';
const CSP_VIOLATIONS_TRUNCATED_EVENT = 'security.csp.violations_truncated';
const CSP_REPORT_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

@ApiTags('Security')
@Controller('csp-reports')
export class CspReportsController {
  private readonly logger = new Logger(CspReportsController.name);

  @ApiOperation({
    summary: 'Collect Content Security Policy violation reports',
    description:
      'Where browsers send the notes app policy violations: `report-uri` posts `application/csp-report`, the Reporting API posts `application/reports+json`. Unauthenticated. Each distinct violation is logged once per request with its directive, the blocked scheme, host and port (subdomains folded into `*.`), the document path and a count, up to 20; nothing is stored.',
  })
  @ApiResponse({ status: 204, description: 'Report received' })
  @ApiResponse({ status: 400, description: 'Not a CSP violation report' })
  @ApiResponse({ status: 413, description: 'Body larger than 64 KB' })
  @Throttle(CSP_REPORT_THROTTLE)
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  collect(@Body() body: unknown): void {
    const violations = readCspViolations(body);
    if (violations === null) {
      throw new BadRequestException('Not a CSP violation report');
    }
    const { groups, droppedViolations } = groupCspViolations(violations);
    for (const group of groups) {
      this.logger.warn({ event: CSP_VIOLATION_EVENT, ...group });
    }
    if (droppedViolations > 0) {
      this.logger.warn({
        event: CSP_VIOLATIONS_TRUNCATED_EVENT,
        droppedViolations,
      });
    }
  }
}
