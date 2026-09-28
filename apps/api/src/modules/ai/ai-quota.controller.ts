import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import {
  AI_ACCESS_TIERS,
  FEATURE_FLAG_KEYS,
  type AiQuota,
} from '@knowtis/shared-types';

import { clientIpOf } from '../../core/http/client-ip';
import { ApiAuthErrors } from '../../core/swagger/api-responses.decorator';
import {
  FeatureFlagGuard,
  RequireFeatureFlag,
} from '../feature-flags/feature-flag.guard';
import { AiUnavailableExceptionFilter } from './ai-unavailable.filter';
import { MessageQuotaService } from './application/services/message-quota.service';
import { TierResolver } from './application/services/tier-resolver.service';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@UseFilters(AiUnavailableExceptionFilter)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
@Controller('ai')
export class AiQuotaController {
  constructor(
    private readonly tierResolver: TierResolver,
    private readonly quota: MessageQuotaService
  ) {}

  @ApiOperation({
    summary: "The caller's daily copilot message quota",
    description:
      'Resolves the tier on the server. `messages` is null for the byok tier; resets at 00:00 UTC.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        tier: { type: 'string', enum: [...AI_ACCESS_TIERS] },
        messages: {
          type: 'object',
          nullable: true,
          properties: {
            used: { type: 'number', example: 12 },
            limit: { type: 'number', example: 30 },
            resetsAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Tier or quota store temporarily unavailable',
  })
  @ApiAuthErrors('AI feature is disabled')
  @Get('quota')
  async getQuota(
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ): Promise<AiQuota> {
    const execution = await this.tierResolver.resolve({
      userId: user.id,
      isAnonymous: user.isAnonymous === true,
      clientIp: clientIpOf(req),
    });
    return this.quota.snapshot(execution);
  }
}
