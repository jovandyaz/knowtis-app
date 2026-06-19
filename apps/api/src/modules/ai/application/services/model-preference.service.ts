import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import type { SelectableModel } from '@knowtis/shared-types';

import {
  USER_AI_SETTINGS_REPOSITORY,
  type UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';
import { AIConfigService } from './ai-config.service';
import { ByokService } from './byok.service';
import { SelectableModelsService } from './selectable-models.service';

@Injectable()
export class ModelPreferenceService {
  constructor(
    @Inject(USER_AI_SETTINGS_REPOSITORY)
    private readonly settings: UserAiSettingsRepository,
    private readonly selectable: SelectableModelsService,
    private readonly aiConfig: AIConfigService,
    private readonly byok: ByokService
  ) {}

  async listModels(userId: string): Promise<SelectableModel[]> {
    const [systemDefault, byokProviders] = await Promise.all([
      this.aiConfig.getDefaultModel(),
      this.byok.enabledProviders(userId),
    ]);
    return this.selectable.list(systemDefault, byokProviders);
  }

  byokProvidersFor(
    userId: string,
    isAnonymous = false
  ): Promise<ReadonlySet<string>> {
    return this.byok.enabledProviders(userId, isAnonymous);
  }

  isSelectableWith(
    modelId: string,
    byokProviders: ReadonlySet<string>
  ): boolean {
    return this.selectable.isSelectable(modelId, byokProviders);
  }

  async getUserPreference(userId: string): Promise<string | null> {
    return this.settings.getPreferredModel(userId);
  }

  async getEffectiveDefault(
    userId: string,
    byokProviders?: ReadonlySet<string>
  ): Promise<string> {
    const providers =
      byokProviders ?? (await this.byok.enabledProviders(userId));
    const pref = await this.settings.getPreferredModel(userId);
    if (pref && this.selectable.isSelectable(pref, providers)) {
      return pref;
    }
    return this.aiConfig.getDefaultModel();
  }

  isSelectable(modelId: string): boolean {
    return this.selectable.isSelectable(modelId);
  }

  async setUserPreference(userId: string, model: string | null): Promise<void> {
    if (model !== null) {
      const byokProviders = await this.byok.enabledProviders(userId);
      if (!this.selectable.isSelectable(model, byokProviders)) {
        throw new BadRequestException(`Model not selectable: ${model}`);
      }
    }
    await this.settings.setPreferredModel(userId, model);
  }
}
