import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import {
  DEFAULT_MODEL_INTENT,
  type AIPreferences,
  type ModelCatalogResponse,
  type ModelReasoning,
  type UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import {
  chooseModel,
  type ModelChoice,
} from '../../domain/model-catalog/model-choice';
import {
  findInCatalog,
  intentModelOf,
} from '../../domain/model-catalog/tier-catalog';
import {
  USER_AI_SETTINGS_REPOSITORY,
  type UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';
import { ModelUnavailableException } from '../../model-unavailable.exception';
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

  async listModels(
    execution: AiExecutionContext
  ): Promise<ModelCatalogResponse> {
    const catalog = this.selectable.catalogFor(
      execution,
      await this.aiConfig.getIntentModels()
    );
    return {
      tier: catalog.tier,
      models: this.selectable.toSelectable(catalog),
      intents: [...catalog.intents],
    };
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
    execution: AiExecutionContext,
    patch: UpdateAiPreferencesInput
  ): Promise<void> {
    if (execution.tier === 'anonymous') {
      throw new ForbiddenException(
        'AI preferences require a registered account'
      );
    }
    if (Object.values(patch).every((value) => value === undefined)) {
      return;
    }
    if (typeof patch.preferredModel === 'string') {
      const platformIntents = await this.aiConfig.getIntentModels();
      const catalog = this.selectable.catalogFor(execution, platformIntents);
      if (!findInCatalog(catalog, patch.preferredModel)) {
        const facts = this.selectable.factsFor(
          execution.byokProviders,
          platformIntents
        );
        throw new ModelUnavailableException(
          facts.isSupported(patch.preferredModel)
            ? 'not_in_tier'
            : 'model_retired',
          intentModelOf(catalog, DEFAULT_MODEL_INTENT)
        );
      }
    }
    await this.settings.patchSettings(execution.subject.userId, patch);
  }
}
