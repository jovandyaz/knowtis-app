import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import type { SelectableModel } from '@knowtis/shared-types';

import {
  USER_AI_SETTINGS_REPOSITORY,
  type UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';
import { AIConfigService } from './ai-config.service';
import { SelectableModelsService } from './selectable-models.service';

@Injectable()
export class ModelPreferenceService {
  constructor(
    @Inject(USER_AI_SETTINGS_REPOSITORY)
    private readonly settings: UserAiSettingsRepository,
    private readonly selectable: SelectableModelsService,
    private readonly aiConfig: AIConfigService
  ) {}

  async listModels(): Promise<SelectableModel[]> {
    const systemDefault = await this.aiConfig.getDefaultModel();
    return this.selectable.list(systemDefault);
  }

  async getUserPreference(userId: string): Promise<string | null> {
    return this.settings.getPreferredModel(userId);
  }

  async getEffectiveDefault(userId: string): Promise<string> {
    const pref = await this.settings.getPreferredModel(userId);
    if (pref && this.selectable.isSelectable(pref)) {
      return pref;
    }
    return this.aiConfig.getDefaultModel();
  }

  assertSelectable(modelId: string): void {
    if (!this.selectable.isSelectable(modelId)) {
      throw new BadRequestException(`Model not selectable: ${modelId}`);
    }
  }

  async setUserPreference(userId: string, model: string | null): Promise<void> {
    if (model !== null) {
      this.assertSelectable(model);
    }
    await this.settings.setPreferredModel(userId, model);
  }
}
