import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

import type {
  AIPreferences,
  ModelReasoning,
  SelectableModel,
  UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import {
  chooseModel,
  type ModelChoice,
} from '../../domain/model-catalog/model-choice';
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
    const models = await this.offeredModels(
      await this.byok.enabledProviders(user.id, user.isAnonymous === true)
    );
    if (user.isAnonymous !== true) {
      return models;
    }
    // Anonymous sessions see the three intent picks only; everything but the
    // running default renders locked so the menu can upsell an account.
    return models
      .filter((m) => m.servesIntent)
      .map((m) => (m.isDefault ? m : { ...m, access: 'requires_account' }));
  }

  private async offeredModels(
    byokProviders: ReadonlySet<string>
  ): Promise<SelectableModel[]> {
    const [systemDefault, configured, ceiling, intentModels] =
      await Promise.all([
        this.aiConfig.getDefaultModel(),
        this.aiConfig.getConfiguredModelIds(),
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

  async reasoningFor(
    modelId: string,
    byokProviders: ReadonlySet<string>
  ): Promise<ModelReasoning | null> {
    return this.selectable.reasoningOf(modelId, byokProviders);
  }

  async chooseTurnModel(
    execution: AiExecutionContext,
    request: { explicit?: string; pinned?: string | null }
  ): Promise<ModelChoice> {
    const [platformIntents, settings] = await Promise.all([
      this.aiConfig.getIntentModels(),
      this.settings.getSettings(execution.subject.userId),
    ]);
    return chooseModel(
      this.selectable.catalogFor(execution, platformIntents),
      {
        ...request,
        preferredModel: settings.preferredModel,
        preferredIntent: settings.preferredIntent,
      },
      this.selectable.factsFor(execution.byokProviders, platformIntents)
    );
  }

  async getUserPreferences(userId: string): Promise<AIPreferences> {
    const { preferredModel, preferredIntent, ghostTextEnabled } =
      await this.settings.getSettings(userId);
    return { preferredModel, preferredIntent, ghostTextEnabled };
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
