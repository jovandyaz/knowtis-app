import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { FEATURE_FLAG_KEYS, type SelectableModel } from '@knowtis/shared-types';

import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import {
  USER_AI_SETTINGS_REPOSITORY,
  type UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';
import { AIConfigService } from './ai-config.service';
import { ByokService } from './byok.service';
import { SelectableModelsService } from './selectable-models.service';

@Injectable()
export class ModelPreferenceService {
  private readonly logger = new Logger(ModelPreferenceService.name);

  constructor(
    @Inject(USER_AI_SETTINGS_REPOSITORY)
    private readonly settings: UserAiSettingsRepository,
    private readonly selectable: SelectableModelsService,
    private readonly aiConfig: AIConfigService,
    private readonly byok: ByokService,
    private readonly flags: FeatureFlagsService
  ) {}

  /** Fail-open: a flag-store outage must degrade to the ungated status quo, never lock users out. */
  async tierGatingOn(): Promise<boolean> {
    try {
      return await this.flags.isEnabled(FEATURE_FLAG_KEYS.AI_TIER_GATING);
    } catch (error) {
      this.logger.warn('ai_tier_gating lookup failed, treating as off', error);
      return false;
    }
  }

  async listModels(userId: string): Promise<SelectableModel[]> {
    const [systemDefault, byokProviders, tierGatingOn] = await Promise.all([
      this.aiConfig.getDefaultModel(),
      this.byok.enabledProviders(userId),
      this.tierGatingOn(),
    ]);
    return this.selectable.list(systemDefault, byokProviders, tierGatingOn);
  }

  byokProvidersFor(
    userId: string,
    isAnonymous = false
  ): Promise<ReadonlySet<string>> {
    return this.byok.enabledProviders(userId, isAnonymous);
  }

  isSelectableWith(
    modelId: string,
    byokProviders: ReadonlySet<string>,
    tierGatingOn: boolean
  ): boolean {
    return this.selectable.isSelectable(modelId, byokProviders, tierGatingOn);
  }

  async getUserPreference(userId: string): Promise<string | null> {
    return this.settings.getPreferredModel(userId);
  }

  async getEffectiveDefault(
    userId: string,
    byokProviders?: ReadonlySet<string>,
    tierGatingOn?: boolean
  ): Promise<string> {
    const providers =
      byokProviders ?? (await this.byok.enabledProviders(userId));
    const gatingOn = tierGatingOn ?? (await this.tierGatingOn());
    const pref = await this.settings.getPreferredModel(userId);
    if (pref && this.selectable.isSelectable(pref, providers, gatingOn)) {
      return pref;
    }
    const systemDefault = await this.aiConfig.getDefaultModel();
    // Only under gating: dark behavior must stay byte-for-byte status quo.
    if (
      !gatingOn ||
      this.selectable.isSelectable(systemDefault, providers, gatingOn)
    ) {
      return systemDefault;
    }
    const fallback = this.selectable.firstSelectable(providers, gatingOn);
    if (!fallback) {
      return systemDefault;
    }
    this.logger.warn({
      event: 'ai.model.default_gated',
      systemDefault,
      fallback,
    });
    return fallback;
  }

  isSelectable(modelId: string): boolean {
    return this.selectable.isSelectable(modelId);
  }

  async setUserPreference(userId: string, model: string | null): Promise<void> {
    if (model !== null) {
      const [byokProviders, tierGatingOn] = await Promise.all([
        this.byok.enabledProviders(userId),
        this.tierGatingOn(),
      ]);
      if (!this.selectable.isSelectable(model, byokProviders, tierGatingOn)) {
        throw new BadRequestException(`Model not selectable: ${model}`);
      }
    }
    await this.settings.setPreferredModel(userId, model);
  }
}
