import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import type {
  AIPreferences,
  ByokProvider,
  ModelCatalogResponse,
  ModelIntent,
  ModelReasoning,
  UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import { reasonOf } from '../../../../core/errors/reason-of';
import { AiUnavailableError } from '../../domain/errors/ai-unavailable.error';
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
  servedPreference,
  type TierCatalog,
} from '../../domain/model-catalog/tier-catalog';
import {
  USER_AI_SETTINGS_REPOSITORY,
  type UserAiSettings,
  type UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';
import { ModelUnavailableException } from '../../model-unavailable.exception';
import { AIConfigService } from './ai-config.service';
import { SelectableModelsService } from './selectable-models.service';

@Injectable()
export class ModelPreferenceService {
  private readonly logger = new Logger(ModelPreferenceService.name);

  constructor(
    @Inject(USER_AI_SETTINGS_REPOSITORY)
    private readonly settings: UserAiSettingsRepository,
    private readonly selectable: SelectableModelsService,
    private readonly aiConfig: AIConfigService
  ) {}

  async listModels(
    execution: AiExecutionContext
  ): Promise<ModelCatalogResponse> {
    const { catalog } = await this.readScope(execution);
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
    const { catalog, facts, settings } = await this.readScope(execution);
    const { preferredModel, preferredIntent } = servedPreference(catalog, {
      preferredModel: settings.preferredModel,
      preferredIntent: settings.preferredIntent,
    });
    return chooseModel(
      catalog,
      { ...request, preferredModel, preferredIntent },
      facts
    );
  }

  /**
   * The stored preferences as a turn reads them, so every surface shows the
   * intent a turn serves. The tier is read, through `tierOf`, only for a
   * stored model an intent is configured to; when it cannot be resolved the
   * stored row is answered as is.
   */
  async getUserPreferences(
    userId: string,
    tierOf: () => Promise<AiExecutionContext>
  ): Promise<AIPreferences> {
    const {
      preferredModel,
      preferredIntent,
      primaryProvider,
      ghostTextEnabled,
    } = await this.settings.getSettings(userId);
    const stored: AIPreferences = {
      preferredModel,
      preferredIntent,
      primaryProvider,
      ghostTextEnabled,
    };
    if (!preferredModel) {
      return stored;
    }
    const platformIntents = await this.aiConfig.getIntentModels();
    // A platform catalog lists only the configured intent models, so any other
    // pick reads as stored without touching the key store behind the tier.
    if (!Object.values(platformIntents).includes(preferredModel)) {
      return stored;
    }
    let execution: AiExecutionContext;
    try {
      execution = await tierOf();
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) {
        throw error;
      }
      this.logger.warn({
        event: 'ai.preferences.tier_unavailable',
        userId,
        error: reasonOf(error),
      });
      return stored;
    }
    return servedPreference(
      this.scopeOf(execution, platformIntents, primaryProvider).catalog,
      stored
    );
  }

  /**
   * Only a model or primary provider write reads the caller's tier, through
   * `tierOf`: a toggle, an intent pick or a clear stays writable while the key
   * store is down. A primary provider must be one the caller holds a key for.
   * A model is accepted exactly when a turn under the written settings would
   * accept it as an explicit request, and a platform-billed one is stored as
   * the intent it serves.
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
    if (
      typeof patch.preferredModel !== 'string' &&
      patch.primaryProvider == null
    ) {
      await this.settings.patchSettings(caller.userId, patch);
      return;
    }
    const execution = await tierOf();
    if (
      patch.primaryProvider != null &&
      !execution.byokProviders.has(patch.primaryProvider)
    ) {
      throw new BadRequestException(
        'primaryProvider must name a provider you hold a key for'
      );
    }
    if (typeof patch.preferredModel !== 'string') {
      await this.settings.patchSettings(caller.userId, patch);
      return;
    }
    const { catalog, facts } = await this.readScope(execution, patch);
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
    await this.settings.patchSettings(
      caller.userId,
      servedPreference(catalog, patch)
    );
  }

  private async readScope(
    execution: AiExecutionContext,
    written: Pick<UpdateAiPreferencesInput, 'primaryProvider'> = {}
  ): Promise<{
    catalog: TierCatalog;
    facts: ModelFacts;
    settings: UserAiSettings;
  }> {
    const [platformIntents, settings] = await Promise.all([
      this.aiConfig.getIntentModels(),
      this.settings.getSettings(execution.subject.userId),
    ]);
    const primaryProvider =
      written.primaryProvider === undefined
        ? settings.primaryProvider
        : written.primaryProvider;
    return {
      ...this.scopeOf(execution, platformIntents, primaryProvider),
      settings,
    };
  }

  private scopeOf(
    execution: AiExecutionContext,
    platformIntents: Readonly<Record<ModelIntent, string>>,
    primaryProvider: ByokProvider | null
  ): { catalog: TierCatalog; facts: ModelFacts } {
    return {
      catalog: this.selectable.catalogFor(
        execution,
        platformIntents,
        primaryProvider
      ),
      facts: this.selectable.factsFor(execution.byokProviders, platformIntents),
    };
  }
}
