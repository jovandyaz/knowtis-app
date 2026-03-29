import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Query,
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
import type { Result } from 'neverthrow';

import { ApiAuthErrors, ApiBadRequest } from '../../core/swagger';
import { Roles, RolesGuard } from '../authorization/roles.guard';
import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { CompleteTextHandler } from './application/commands/complete-text.handler';
import { VoiceNoteHandler } from './application/commands/voice-note.handler';
import { AIConfigService } from './application/services/ai-config.service';
import { AIErrorCodes, type AIDomainError } from './domain/errors/ai.errors';
import {
  AI_USAGE_REPOSITORY,
  type AIUsageRepository,
  type MetricsPeriod,
} from './domain/ports/ai-usage.repository';
import { AICompleteDto } from './dto/ai.dto';
import { SetAIConfigDto } from './dto/set-ai-config.dto';
import { VoiceNoteDto } from './dto/voice-note.dto';

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
    private readonly voiceNoteHandler: VoiceNoteHandler,
    private readonly aiConfigService: AIConfigService,
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
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.voiceNoteHandler.execute({
      userId: user.id,
      audio: audio.buffer,
      mode: dto.mode,
      ...(dto.language !== undefined && { language: dto.language }),
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

  @ApiOperation({
    summary: 'Get all AI configuration values',
    description:
      'Returns all dynamic AI configuration key-value pairs from the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'AI configuration map',
    schema: {
      type: 'object',
      additionalProperties: { type: 'string' },
      example: {
        ai_default_model: 'anthropic:claude-sonnet-4-20250514',
        ai_fast_model: 'anthropic:claude-haiku-4-5-20251001',
      },
    },
  })
  @ApiAuthErrors('AI feature is disabled')
  @Get('config')
  async getConfig(): Promise<Record<string, string>> {
    return this.aiConfigService.getAllConfig();
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
          example: 'anthropic:claude-sonnet-4-20250514',
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
  @UseGuards(JwtAuthGuard, FeatureFlagGuard, RolesGuard)
  @RequireFeatureFlag('ai_enabled')
  @Roles('admin')
  @Put('config/:key')
  async setConfig(
    @Param('key') key: string,
    @Body() body: SetAIConfigDto
  ): Promise<{ success: true }> {
    try {
      await this.aiConfigService.setConfig(key, body.value, body.description);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : `Invalid config key: '${key}'`
      );
    }
    return { success: true };
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
