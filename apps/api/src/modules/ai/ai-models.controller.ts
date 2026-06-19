import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import type { AIPreferences, SelectableModel } from '@knowtis/shared-types';

import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { ModelPreferenceService } from './application/services/model-preference.service';
import { UpdateAiPreferencesDto } from './dto/update-ai-preferences.dto';

@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag('ai_enabled')
@Controller('ai')
export class AiModelsController {
  constructor(private readonly preferences: ModelPreferenceService) {}

  @Get('models')
  listModels(@CurrentUser() user: RequestUser): Promise<SelectableModel[]> {
    return this.preferences.listModels(user.id);
  }

  @Get('preferences')
  async getPreferences(
    @CurrentUser() user: RequestUser
  ): Promise<AIPreferences> {
    return {
      preferredModel: await this.preferences.getUserPreference(user.id),
    };
  }

  @Put('preferences')
  async updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAiPreferencesDto
  ): Promise<AIPreferences> {
    await this.preferences.setUserPreference(user.id, dto.preferredModel);
    return { preferredModel: dto.preferredModel };
  }
}
