import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpStatus,
  Inject,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { unwrapOrThrow } from '../../core/http';
import { ApiAuthErrors, ApiBadRequest } from '../../core/swagger';
import { Roles, RolesGuard } from '../authorization/roles.guard';
import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { realIpOf } from '../websocket/socket-auth';
import { CompleteTextHandler } from './application/commands/complete-text.handler';
import { VoiceNoteHandler } from './application/commands/voice-note.handler';
import {
  AIConfigService,
  InvalidAIConfigError,
  type AIConfigEntry,
} from './application/services/ai-config.service';
import { AIErrorCodes } from './domain/errors/ai.errors';
import {
  AI_USAGE_REPOSITORY,
  type AIUsageRepository,
  type MetricsPeriod,
} from './domain/ports/ai-usage.repository';
import { AICompleteDto } from './dto/ai.dto';
import { SetAIConfigDto } from './dto/set-ai-config.dto';
import { VoiceNoteDto } from './dto/voice-note.dto';
import { UserScopedThrottlerGuard } from './guards/user-scoped-throttler.guard';
import {
  FallbackChainService,
  type ProviderHealth,
} from './infrastructure/providers/fallback-chain.service';

const AI_ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [AIErrorCodes.RATE_LIMIT_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
  [AIErrorCodes.PROVIDER_ERROR]: HttpStatus.BAD_GATEWAY,
  [AIErrorCodes.FEATURE_DISABLED]: HttpStatus.FORBIDDEN,
  [AIErrorCodes.INVALID_MODEL]: HttpStatus.BAD_REQUEST,
  [AIErrorCodes.INVALID_ACTION]: HttpStatus.BAD_REQUEST,
  [AIErrorCodes.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [AIErrorCodes.PROMPT_INJECTION_DETECTED]: HttpStatus.UNPROCESSABLE_ENTITY,
  [AIErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

const VALID_PERIODS: readonly MetricsPeriod[] = ['day', 'week', 'month'];

const completionResultSchema = {
  type: 'object' as const,
  properties: {
    text: { type: 'string', example: 'Here is the summary...' },
    inputTokens: { type: 'number', example: 150 },
    outputTokens: { type: 'number', example: 75 },
    model: { type: 'string', example: 'anthropic:claude-sonnet-5' },
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

const effectiveConfigSchema = {
  type: 'array' as const,
  items: {
    type: 'object',
    properties: {
      key: { type: 'string', example: 'ai_default_model' },
      value: {
        type: 'string',
        example: 'openrouter:minimax/minimax-m2.5',
      },
      kind: {
        type: 'string',
        enum: ['model', 'chain'],
        example: 'model',
      },
      source: {
        type: 'string',
        enum: ['custom', 'default'],
        example: 'custom',
      },
      description: { type: 'string', nullable: true },
      updatedAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
      },
    },
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
    byModel: {
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
        'anthropic:claude-sonnet-5': {
          requests: 15,
          tokens: 10000,
          costUsd: 0.012,
        },
        'anthropic:claude-haiku-5': {
          requests: 10,
          tokens: 8600,
          costUsd: 0.0066,
        },
      },
    },
  },
};

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag('ai_enabled')
export class AIController {
  constructor(
    private readonly completeTextHandler: CompleteTextHandler,
    private readonly voiceNoteHandler: VoiceNoteHandler,
    private readonly aiConfigService: AIConfigService,
    private readonly fallbackChain: FallbackChainService,
    @Inject(AI_USAGE_REPOSITORY)
    private readonly usageRepository: AIUsageRepository
  ) {}

  @ApiOperation({
    summary: 'Per-provider AI health',
    description:
      'Passive health snapshot from the provider cooldown tracker. No probes are sent and no tokens are spent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Health snapshot per provider',
    schema: {
      type: 'object',
      properties: {
        providers: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              configured: { type: 'boolean', example: true },
              cooling: { type: 'boolean', example: false },
              failureCount: { type: 'number', example: 0 },
              lastFailureAt: {
                type: 'string',
                nullable: true,
                example: null,
              },
              lastSuccessAt: {
                type: 'string',
                nullable: true,
                example: '2026-06-10T12:00:00.000Z',
              },
              cooldownEndsAt: {
                type: 'string',
                nullable: true,
                example: null,
              },
            },
          },
        },
      },
    },
  })
  @ApiAuthErrors('AI feature is disabled')
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin role required',
  })
  @UseGuards(JwtAuthGuard, FeatureFlagGuard, RolesGuard)
  @RequireFeatureFlag('ai_enabled')
  @Roles('admin')
  @Get('health')
  getHealth(): { providers: Record<string, ProviderHealth> } {
    return { providers: this.fallbackChain.healthSnapshot() };
  }

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
  async complete(
    @CurrentUser() user: RequestUser,
    @Body() dto: AICompleteDto,
    @Req() req: Request
  ) {
    const clientIp = realIpOf(req.headers) ?? req.ip;
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
      ...(clientIp ? { clientIp } : {}),
    });
    return unwrapOrThrow(result, AI_ERROR_STATUS_MAP);
  }

  @ApiOperation({ summary: 'Create a structured note from voice recording' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio', 'mode'],
      properties: {
        audio: { type: 'string', format: 'binary' },
        mode: { type: 'string', enum: ['create-note', 'insert'] },
        language: { type: 'string', maxLength: 5 },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Structured voice note result',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', example: 'Meeting Notes' },
        content: { type: 'string', example: '<p>Key discussion points...</p>' },
        transcript: {
          type: 'string',
          example: "So in today's meeting we discussed...",
        },
      },
    },
  })
  @ApiBadRequest('invalid audio file or mode')
  @ApiAuthErrors('AI or voice-notes feature is disabled')
  @RequireFeatureFlag('voice_notes_enabled')
  @Post('voice-note')
  @UseInterceptors(FileInterceptor('audio'))
  async voiceNote(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^audio\//,
            skipMagicNumbersValidation: true,
          }),
        ],
      })
    )
    audio: Express.Multer.File,
    @Body() dto: VoiceNoteDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    const clientIp = realIpOf(req.headers) ?? req.ip;
    const result = await this.voiceNoteHandler.execute({
      userId: user.id,
      audio: audio.buffer,
      mode: dto.mode,
      ...(dto.language !== undefined && { language: dto.language }),
      ...(user.isAnonymous && { isAnonymous: true }),
      ...(clientIp ? { clientIp } : {}),
    });

    return unwrapOrThrow(result, AI_ERROR_STATUS_MAP);
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

  @ApiOperation({
    summary: 'Get the effective AI configuration',
    description:
      'Returns every AI config key resolved to its effective value: the database row when present, the code default otherwise.',
  })
  @ApiResponse({
    status: 200,
    description: 'Effective AI configuration entries',
    schema: effectiveConfigSchema,
  })
  @ApiAuthErrors('AI feature is disabled')
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin role required',
  })
  @UseGuards(
    JwtAuthGuard,
    FeatureFlagGuard,
    RolesGuard,
    UserScopedThrottlerGuard
  )
  @RequireFeatureFlag('ai_enabled')
  @Roles('admin')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('config')
  async getConfig(): Promise<AIConfigEntry[]> {
    return this.aiConfigService.getEffectiveConfig();
  }

  @ApiOperation({
    summary: 'Set an AI configuration value',
    description:
      'Creates or updates a dynamic AI configuration key in the database.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['value'],
      properties: {
        value: {
          type: 'string',
          example: 'anthropic:claude-sonnet-5',
        },
        description: {
          type: 'string',
          example: 'Default model for AI completions',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean', example: true } },
    },
  })
  @ApiBadRequest('invalid config key or value')
  @ApiAuthErrors('AI feature is disabled')
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin role required',
  })
  @UseGuards(
    JwtAuthGuard,
    FeatureFlagGuard,
    RolesGuard,
    UserScopedThrottlerGuard
  )
  @RequireFeatureFlag('ai_enabled')
  @Roles('admin')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Put('config/:key')
  async setConfig(
    @CurrentUser() user: RequestUser,
    @Param('key') key: string,
    @Body() body: SetAIConfigDto
  ): Promise<{ success: true }> {
    try {
      await this.aiConfigService.setConfig(
        key,
        body.value,
        user.id,
        body.description
      );
    } catch (error) {
      if (error instanceof InvalidAIConfigError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    return { success: true };
  }

  @ApiOperation({
    summary: 'Reset an AI configuration value to its code default',
    description:
      'Deletes the database override for a dynamic AI configuration key so it resolves to its code default. Idempotent when no override exists.',
  })
  @ApiResponse({
    status: 200,
    description: 'Effective AI configuration entries after the reset',
    schema: effectiveConfigSchema,
  })
  @ApiBadRequest('invalid config key')
  @ApiAuthErrors('AI feature is disabled')
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin role required',
  })
  @UseGuards(
    JwtAuthGuard,
    FeatureFlagGuard,
    RolesGuard,
    UserScopedThrottlerGuard
  )
  @RequireFeatureFlag('ai_enabled')
  @Roles('admin')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Delete('config/:key')
  async resetConfig(
    @CurrentUser() user: RequestUser,
    @Param('key') key: string
  ): Promise<AIConfigEntry[]> {
    try {
      await this.aiConfigService.resetConfig(key, user.id);
    } catch (error) {
      if (error instanceof InvalidAIConfigError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    return this.aiConfigService.getEffectiveConfig();
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
