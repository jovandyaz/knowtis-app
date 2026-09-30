import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import {
  FEATURE_FLAG_KEYS,
  type AIPreferences,
  type ModelCatalogResponse,
} from '@knowtis/shared-types';

import { clientIpOf } from '../../core/http/client-ip';
import {
  ApiAuthErrors,
  ApiServiceUnavailable,
} from '../../core/swagger/api-responses.decorator';
import {
  FeatureFlagGuard,
  RequireFeatureFlag,
} from '../feature-flags/feature-flag.guard';
import { AiUnavailableExceptionFilter } from './ai-unavailable.filter';
import { ModelPreferenceService } from './application/services/model-preference.service';
import { TierResolver } from './application/services/tier-resolver.service';
import type { AiExecutionContext } from './domain/execution-context/ai-execution-context';
import { UpdateAiPreferencesDto } from './dto/update-ai-preferences.dto';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@UseFilters(AiUnavailableExceptionFilter)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
@Controller('ai')
export class AiModelsController {
  constructor(
    private readonly preferences: ModelPreferenceService,
    private readonly tierResolver: TierResolver
  ) {}

  @ApiServiceUnavailable(
    "the caller's tier could not be resolved; retry after 5s"
  )
  @ApiAuthErrors('AI feature is disabled')
  @Get('models')
  async listModels(
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ): Promise<ModelCatalogResponse> {
    return this.preferences.listModels(await this.executionOf(user, req));
  }

  @Get('preferences')
  getPreferences(
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ): Promise<AIPreferences> {
    return this.preferences.getUserPreferences(user.id, () =>
      this.executionOf(user, req)
    );
  }

  @ApiResponse({
    status: 422,
    description:
      'AI_MODEL_UNAVAILABLE: the model is outside your tier; details carry reason and suggestedModel',
  })
  @ApiServiceUnavailable(
    "a model write could not resolve the caller's tier; retry after 5s"
  )
  @ApiAuthErrors('AI feature is disabled, or the caller is anonymous')
  @Put('preferences')
  async updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAiPreferencesDto,
    @Req() req: Request
  ): Promise<AIPreferences> {
    const tierOf = this.onceExecutionOf(user, req);
    await this.preferences.setUserPreferences(
      { userId: user.id, isAnonymous: user.isAnonymous === true },
      dto,
      tierOf
    );
    return this.preferences.getUserPreferences(user.id, tierOf);
  }

  private executionOf(user: RequestUser, req: Request) {
    return this.tierResolver.resolve({
      userId: user.id,
      isAnonymous: user.isAnonymous === true,
      clientIp: clientIpOf(req),
    });
  }

  private onceExecutionOf(
    user: RequestUser,
    req: Request
  ): () => Promise<AiExecutionContext> {
    let execution: Promise<AiExecutionContext> | undefined;
    return () => (execution ??= this.executionOf(user, req));
  }
}
