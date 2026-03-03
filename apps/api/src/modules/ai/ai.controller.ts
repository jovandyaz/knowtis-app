import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Result } from 'neverthrow';

import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { CompleteTextHandler } from './application/commands/complete-text.handler';
import { AIErrorCodes, type AIDomainError } from './domain/errors/ai.errors';
import {
  AI_USAGE_REPOSITORY,
  type AIUsageRepository,
} from './domain/ports/ai-usage.repository';
import { AICompleteDto } from './dto/ai.dto';

const AI_ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [AIErrorCodes.RATE_LIMIT_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
  [AIErrorCodes.PROVIDER_ERROR]: HttpStatus.BAD_GATEWAY,
  [AIErrorCodes.FEATURE_DISABLED]: HttpStatus.FORBIDDEN,
  [AIErrorCodes.INVALID_MODEL]: HttpStatus.BAD_REQUEST,
  [AIErrorCodes.INVALID_ACTION]: HttpStatus.BAD_REQUEST,
  [AIErrorCodes.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [AIErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

const VALID_PERIODS = ['day', 'week', 'month'] as const;
type MetricsPeriod = (typeof VALID_PERIODS)[number];

function unwrapOrThrow<T>(result: Result<T, AIDomainError>): T {
  if (result.isErr()) {
    const status =
      AI_ERROR_STATUS_MAP[result.error.code] ?? HttpStatus.BAD_REQUEST;
    throw new HttpException(
      {
        statusCode: status,
        error: result.error.code,
        message: result.error.message,
      },
      status
    );
  }
  return result.value;
}

@Controller('ai')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag('ai_enabled')
export class AIController {
  constructor(
    private readonly completeTextHandler: CompleteTextHandler,
    @Inject(AI_USAGE_REPOSITORY)
    private readonly usageRepository: AIUsageRepository
  ) {}

  @Post('complete')
  async complete(@CurrentUser() user: RequestUser, @Body() dto: AICompleteDto) {
    const result = await this.completeTextHandler.execute({
      userId: user.id,
      action: dto.action,
      content: dto.content,
      ...(dto.selection !== undefined && { selection: dto.selection }),
      ...(dto.targetLanguage !== undefined && {
        targetLanguage: dto.targetLanguage,
      }),
      ...(dto.targetTone !== undefined && { targetTone: dto.targetTone }),
    });
    return unwrapOrThrow(result);
  }

  @Get('usage')
  async getUsage(@CurrentUser() user: RequestUser) {
    return this.usageRepository.getDailyUsage(user.id);
  }

  @Get('metrics')
  async getMetrics(
    @CurrentUser() user: RequestUser,
    @Query('period') period?: string
  ) {
    const validPeriod = this.parsePeriod(period);
    return this.usageRepository.getMetricsSummary(user.id, validPeriod);
  }

  private parsePeriod(period?: string): MetricsPeriod {
    if (!period) {
      return 'day';
    }
    if (VALID_PERIODS.includes(period as MetricsPeriod)) {
      return period as MetricsPeriod;
    }
    throw new BadRequestException(
      `Invalid period '${period}'. Must be one of: ${VALID_PERIODS.join(', ')}`
    );
  }
}
