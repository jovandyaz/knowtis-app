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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Result } from 'neverthrow';

import { ApiAuthErrors, ApiBadRequest } from '../../core/swagger';
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

const completionResultSchema = {
  type: 'object' as const,
  properties: {
    text: { type: 'string', example: 'Here is the summary...' },
    inputTokens: { type: 'number', example: 150 },
    outputTokens: { type: 'number', example: 75 },
    model: { type: 'string', example: 'claude-sonnet-4-20250514' },
  },
};

const dailyUsageSchema = {
  type: 'object' as const,
  properties: {
    totalInputTokens: { type: 'number', example: 1520 },
    totalOutputTokens: { type: 'number', example: 830 },
    totalCostUsd: { type: 'number', format: 'float', example: 0.0024 },
    requestCount: { type: 'number', example: 5 },
  },
};

const metricsSummarySchema = {
  type: 'object' as const,
  properties: {
    totalRequests: { type: 'number', example: 25 },
    totalInputTokens: { type: 'number', example: 12400 },
    totalOutputTokens: { type: 'number', example: 6200 },
    totalCostUsd: { type: 'number', format: 'float', example: 0.0186 },
    byAction: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          requests: { type: 'number' },
          tokens: { type: 'number' },
          costUsd: { type: 'number', format: 'float' },
        },
      },
      example: {
        summarize: { requests: 15, tokens: 10000, costUsd: 0.012 },
        translate: { requests: 10, tokens: 8600, costUsd: 0.0066 },
      },
    },
  },
};

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

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag('ai_enabled')
export class AIController {
  constructor(
    private readonly completeTextHandler: CompleteTextHandler,
    @Inject(AI_USAGE_REPOSITORY)
    private readonly usageRepository: AIUsageRepository
  ) {}

  @ApiOperation({
    summary: 'Complete text with AI',
    description:
      'Processes text using the specified AI action (summarize, expand, translate, etc.). Requires the ai_enabled feature flag.',
  })
  @ApiBody({ type: AICompleteDto })
  @ApiResponse({
    status: 200,
    description: 'AI completion result',
    schema: completionResultSchema,
  })
  @ApiBadRequest('invalid action or input')
  @ApiAuthErrors('AI feature is disabled')
  @ApiResponse({
    status: 429,
    description: 'Too many requests — rate limit exceeded',
  })
  @ApiResponse({
    status: 502,
    description: 'Bad gateway — AI provider error',
  })
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
      ...(user.isAnonymous && { isAnonymous: true }),
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({
    summary: 'Get personal AI usage for today',
    description:
      "Returns the authenticated user's AI token usage and cost for the current day.",
  })
  @ApiResponse({
    status: 200,
    description: 'Daily AI usage summary',
    schema: dailyUsageSchema,
  })
  @ApiAuthErrors('AI feature is disabled')
  @Get('usage')
  async getUsage(@CurrentUser() user: RequestUser) {
    return this.usageRepository.getDailyUsage(user.id);
  }

  @ApiOperation({
    summary: 'Get personal AI metrics for a period',
    description:
      "Returns the authenticated user's aggregated AI metrics for the specified period, broken down by action type.",
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month'],
    description: 'Metrics aggregation period. Defaults to "day" if omitted.',
    example: 'week',
  })
  @ApiResponse({
    status: 200,
    description: 'AI metrics summary for the requested period',
    schema: metricsSummarySchema,
  })
  @ApiBadRequest('invalid period value')
  @ApiAuthErrors('AI feature is disabled')
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
