import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import {
  FEATURE_FLAG_KEYS,
  type OrganizationSuggestion,
} from '@knowtis/shared-types';

import { clientIpOf } from '../../core/http/client-ip';
import { unwrapOrThrow } from '../../core/http/unwrap-or-throw';
import {
  ApiAuthErrors,
  ApiBadRequest,
  ApiServiceUnavailable,
} from '../../core/swagger/api-responses.decorator';
import { AiUnavailableExceptionFilter } from '../ai/ai-unavailable.filter';
import { TierResolver } from '../ai/application/services/tier-resolver.service';
import { AIErrorCodes } from '../ai/domain/errors/ai.errors';
import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { SuggestOrganizationHandler } from './application/commands/suggest-organization.handler';
import { SuggestOrganizationDto } from './dto/suggest-organization.dto';

const AI_ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [AIErrorCodes.RATE_LIMIT_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
  [AIErrorCodes.PROVIDER_ERROR]: HttpStatus.BAD_GATEWAY,
  [AIErrorCodes.PROVIDER_OVERLOADED]: HttpStatus.SERVICE_UNAVAILABLE,
  [AIErrorCodes.INVALID_MODEL]: HttpStatus.INTERNAL_SERVER_ERROR,
  [AIErrorCodes.TIMEOUT]: HttpStatus.GATEWAY_TIMEOUT,
  [AIErrorCodes.FEATURE_DISABLED]: HttpStatus.FORBIDDEN,
  [AIErrorCodes.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [AIErrorCodes.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [AIErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** One bulk pass fans out a model call per note, so this is tighter than the read endpoints. */
const SUGGEST_THROTTLE = { default: { limit: 10, ttl: 60000 } };

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@UseFilters(AiUnavailableExceptionFilter)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
@Controller('ai/organization')
export class AiOrganizationController {
  constructor(
    private readonly suggestHandler: SuggestOrganizationHandler,
    private readonly tierResolver: TierResolver
  ) {}

  @ApiOperation({
    summary: 'Suggest a bucket and tags for notes the caller owns',
    description:
      'Read-only. The response is a proposal: applying it is a PATCH the client sends, so there is no path through which the AI writes an organization field.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'One entry per note' })
  @ApiBadRequest('more notes than the bulk cap, or a malformed id')
  @ApiAuthErrors('a note in the request is not owned by the caller')
  @ApiServiceUnavailable(
    "the caller's tier could not be resolved; retry after 5s"
  )
  @Post('suggest')
  @HttpCode(HttpStatus.OK)
  @Throttle(SUGGEST_THROTTLE)
  async suggest(
    @CurrentUser() user: RequestUser,
    @Body() dto: SuggestOrganizationDto,
    @Req() request: Request
  ): Promise<OrganizationSuggestion[]> {
    const execution = await this.tierResolver.resolve({
      userId: user.id,
      isAnonymous: user.isAnonymous === true,
      clientIp: clientIpOf(request),
    });
    const result = await this.suggestHandler.execute({
      execution,
      noteIds: dto.noteIds,
    });

    return unwrapOrThrow(result, AI_ERROR_STATUS_MAP);
  }
}
