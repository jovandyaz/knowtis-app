import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import type {
  AIPreferences,
  ModelCatalogResponse,
  ModelIntent,
  ModelReasoning,
  UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import type {
  AiCaller,
  AiExecutionContext,
} from '../../domain/execution-context/ai-execution-context';
import {
  chooseModel,
  MODEL_CHOICE,
  type ModelChoice,
  type ModelFacts,
} from '../../domain/model-catalog/model-choice';
import {
  platformIntentOf,
  type TierCatalog,
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
    const { catalog, facts } = this.scopeOf(execution, platformIntents);
    const pickedIntent = settings.preferredModel
      ? platformIntentOf(catalog, settings.preferredModel)
      : undefined;
    return chooseModel(
      catalog,
      {
        ...request,
        preferredModel: pickedIntent ? null : settings.preferredModel,
        preferredIntent: pickedIntent ?? settings.preferredIntent,
      },
      facts
    );
  }

  async getUserPreferences(userId: string): Promise<AIPreferences> {
    const { preferredModel, preferredIntent, ghostTextEnabled } =
      await this.settings.getSettings(userId);
    return { preferredModel, preferredIntent, ghostTextEnabled };
  }

  /**
   * Only a model write reads the caller's tier, through `tierOf`: a toggle or
   * an intent pick stays writable while the key store is down. A model is
   * accepted exactly when a turn would accept it as an explicit request, and a
   * platform-billed one is stored as the intent it serves.
   */
  async setUserPreferences(
    caller: Pick<AiCaller, 'userId' | 'isAnonymous'>,
    patch: UpdateAiPreferencesInput,
    tierOf: () => Promise<AiExecutionContext>
  ): Promise<void> {
    if (caller.isAnonymous) {
      throw new ForbiddenException(
        'AI preferences require a registered account'
      );
    }
    if (Object.values(patch).every((value) => value === undefined)) {
      return;
    }
    if (typeof patch.preferredModel !== 'string') {
      await this.settings.patchSettings(caller.userId, patch);
      return;
    }
    const [execution, platformIntents] = await Promise.all([
      tierOf(),
      this.aiConfig.getIntentModels(),
    ]);
    const { catalog, facts } = this.scopeOf(execution, platformIntents);
    const choice = chooseModel(
      catalog,
      {
        explicit: patch.preferredModel,
        preferredModel: null,
        preferredIntent: null,
      },
      facts
    );
    if (choice.kind === MODEL_CHOICE.UNAVAILABLE) {
      throw new ModelUnavailableException(choice.reason, choice.suggestedModel);
    }
    const pickedIntent = platformIntentOf(catalog, patch.preferredModel);
    await this.settings.patchSettings(
      caller.userId,
      pickedIntent
        ? { ...patch, preferredModel: null, preferredIntent: pickedIntent }
        : patch
    );
  }

  private scopeOf(
    execution: AiExecutionContext,
    platformIntents: Readonly<Record<ModelIntent, string>>
  ): { catalog: TierCatalog; facts: ModelFacts } {
    return {
      catalog: this.selectable.catalogFor(execution, platformIntents),
      facts: this.selectable.factsFor(execution.byokProviders, platformIntents),
    };
  }
}
