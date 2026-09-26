import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  FEATURE_FLAG_KEYS,
  type AIPreferences,
  type SelectableModel,
} from '@knowtis/shared-types';

import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { ModelPreferenceService } from './application/services/model-preference.service';
import { UpdateAiPreferencesDto } from './dto/update-ai-preferences.dto';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
@Controller('ai')
export class AiModelsController {
  constructor(private readonly preferences: ModelPreferenceService) {}

  @Get('models')
  listModels(@CurrentUser() user: RequestUser): Promise<SelectableModel[]> {
    return this.preferences.listModels(user);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: RequestUser): Promise<AIPreferences> {
    return this.preferences.getUserPreferences(user.id);
  }

  @Put('preferences')
  async updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAiPreferencesDto
  ): Promise<AIPreferences> {
    await this.preferences.setUserPreferences(user, dto);
    return this.preferences.getUserPreferences(user.id);
  }
}
