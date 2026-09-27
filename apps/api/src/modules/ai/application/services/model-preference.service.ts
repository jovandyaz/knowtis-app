import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

import { providerOf } from '@knowtis/ai-gateway';
import {
  DEFAULT_MODEL_INTENT,
  type AIPreferences,
  type ModelReasoning,
  type SelectableModel,
  type UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

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

  async listModels(user: {
    id: string;
    isAnonymous?: boolean;
  }): Promise<SelectableModel[]> {
    const models = await this.offeredModels(user);
    if (user.isAnonymous !== true) {
      return models;
    }
    // Anonymous sessions see the three intent picks only; everything but the
    // running default renders locked so the menu can upsell an account.
    return models
      .filter((m) => m.servesIntent)
      .map((m) => (m.isDefault ? m : { ...m, access: 'requires_account' }));
  }

  private async offeredModels(user: {
    id: string;
    isAnonymous?: boolean;
  }): Promise<SelectableModel[]> {
    const [systemDefault, configured, byokProviders, ceiling, intentModels] =
      await Promise.all([
        this.aiConfig.getDefaultModel(),
        this.aiConfig.getConfiguredModelIds(),
        this.byok.enabledProviders(user.id, user.isAnonymous === true),
        this.aiConfig.getFreeTierMaxOutputCostPerToken(),
        this.aiConfig.getIntentModels(),
      ]);
    return this.selectable.list(
      systemDefault,
      configured,
      byokProviders,
      ceiling,
      intentModels
    );
  }

  /**
   * Declared reasoning of a model this user is offered, trimmed to what their
   * tier may spend. A ladder is a capability statement, so it reads the offered
   * union itself, never the anonymous menu view: a chain candidate the upsell
   * menu hides still declares what it can do. Null when unoffered or undeclared.
   */
  async reasoningFor(
    modelId: string,
    user: { id: string; isAnonymous?: boolean }
  ): Promise<ModelReasoning | null> {
    const models = await this.offeredModels(user);
    return models.find((model) => model.id === modelId)?.reasoning ?? null;
  }

  byokProvidersFor(
    userId: string,
    isAnonymous = false
  ): Promise<ReadonlySet<string>> {
    return this.byok.enabledProviders(userId, isAnonymous);
  }

  async isSelectableWith(
    modelId: string,
    byokProviders: ReadonlySet<string>
  ): Promise<boolean> {
    const [configured, ceiling] = await Promise.all([
      this.aiConfig.getConfiguredModelIds(),
      this.aiConfig.getFreeTierMaxOutputCostPerToken(),
    ]);
    return this.selectable.isSelectable(
      modelId,
      configured,
      byokProviders,
      ceiling
    );
  }

  async getUserPreferences(userId: string): Promise<AIPreferences> {
    const { preferredModel, preferredIntent, ghostTextEnabled } =
      await this.settings.getSettings(userId);
    return { preferredModel, preferredIntent, ghostTextEnabled };
  }

  async getEffectiveDefault(
    userId: string,
    byokProviders?: ReadonlySet<string>
  ): Promise<string> {
    const providers =
      byokProviders ?? (await this.byok.enabledProviders(userId));
    const [offered, ceiling] = await Promise.all([
      this.aiConfig.getConfiguredModelIds(),
      this.aiConfig.getFreeTierMaxOutputCostPerToken(),
    ]);
    const { preferredModel, preferredIntent } =
      await this.settings.getSettings(userId);
    // Only Advanced (BYOK-billed) picks are overrides — anything else the UI cannot show.
    if (
      preferredModel &&
      providers.has(providerOf(preferredModel)) &&
      this.selectable.isSelectable(preferredModel, offered, providers, ceiling)
    ) {
      return preferredModel;
    }
    const intent = preferredIntent ?? DEFAULT_MODEL_INTENT;
    // Only an intent the user stored may steer their default onto their own
    // key; the implicit fallback must never move billing without an opt-in.
    const byokPick = preferredIntent
      ? this.selectable.firstOfTier(preferredIntent, offered, providers)
      : null;
    // Tautological today, but keeps intent picks safe if accessFor ever gates BYOK holders.
    if (
      byokPick &&
      this.selectable.isSelectable(byokPick, offered, providers, ceiling)
    ) {
      return byokPick;
    }
    const configured = await this.aiConfig.getIntentModel(intent);
    if (this.selectable.isSelectable(configured, offered, providers, ceiling)) {
      return configured;
    }
    return await this.aiConfig.getDefaultModel();
  }

  async setUserPreferences(
    user: { id: string; isAnonymous?: boolean },
    patch: UpdateAiPreferencesInput
  ): Promise<void> {
    if (user.isAnonymous === true) {
      throw new ForbiddenException(
        'AI preferences require a registered account'
      );
    }
    if (Object.values(patch).every((value) => value === undefined)) {
      return;
    }
    if (typeof patch.preferredModel === 'string') {
      const [byokProviders, offered, ceiling] = await Promise.all([
        this.byok.enabledProviders(user.id),
        this.aiConfig.getConfiguredModelIds(),
        this.aiConfig.getFreeTierMaxOutputCostPerToken(),
      ]);
      if (
        !this.selectable.isSelectable(
          patch.preferredModel,
          offered,
          byokProviders,
          ceiling
        )
      ) {
        throw new BadRequestException(
          `Model not selectable: ${patch.preferredModel}`
        );
      }
    }
    await this.settings.patchSettings(user.id, patch);
  }
}
