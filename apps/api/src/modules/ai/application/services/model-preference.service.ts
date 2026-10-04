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
import { CATALOG_SCOPE } from '../../domain/execution-context/tier-policy';
import {
  chooseModel,
  MODEL_CHOICE,
  retiredStoredPick,
  type ModelChoice,
  type ModelFacts,
} from '../../domain/model-catalog/model-choice';
import {
  servedPreference,
  type TierCatalog,
} from '../../domain/model-catalog/tier-catalog';
import {
  USER_AI_SETTINGS_REPOSITORY,
  type UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';
import { ModelIndexCache } from '../../infrastructure/catalog/model-index.cache';
import { ModelUnavailableException } from '../../model-unavailable.exception';
import { AIConfigService } from './ai-config.service';
import { SelectableModelsService } from './selectable-models.service';

/** A turn's model choice; `retiredPick` names the stored pick the turn reports as retired, to forget once that report reaches the caller. */
export type TurnModelChoice = ModelChoice & { readonly retiredPick?: string };

@Injectable()
export class ModelPreferenceService {
  private readonly logger = new Logger(ModelPreferenceService.name);

  constructor(
    @Inject(USER_AI_SETTINGS_REPOSITORY)
    private readonly settings: UserAiSettingsRepository,
    private readonly selectable: SelectableModelsService,
    private readonly aiConfig: AIConfigService,
    private readonly index: ModelIndexCache
  ) {}

  async listModels(
    execution: AiExecutionContext
  ): Promise<ModelCatalogResponse> {
    const [platformIntents, primaryProvider] = await Promise.all([
      this.aiConfig.getIntentModels(),
      this.storedPrimaryOf(execution),
    ]);
    const catalog = this.selectable.catalogFor(
      execution,
      platformIntents,
      primaryProvider
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

  /**
   * The model a turn runs on. A stored pick the synced index has retired is
   * named as `retiredPick`, for the turn to forget once it has delivered the
   * report; never while the index still serves the vendored snapshot.
   */
  async chooseTurnModel(
    execution: AiExecutionContext,
    request: { explicit?: string; pinned?: string | null }
  ): Promise<TurnModelChoice> {
    const [platformIntents, settings] = await Promise.all([
      this.aiConfig.getIntentModels(),
      this.settings.getSettings(execution.subject.userId),
    ]);
    const servesSnapshot = this.index.servesSnapshot();
    const { catalog, facts } = this.scopeOf(
      execution,
      platformIntents,
      settings.primaryProvider
    );
    const { preferredModel, preferredIntent } = servedPreference(catalog, {
      preferredModel: settings.preferredModel,
      preferredIntent: settings.preferredIntent,
    });
    const modelRequest = { ...request, preferredModel, preferredIntent };
    const choice = chooseModel(catalog, modelRequest, facts);
    const retiredPick = servesSnapshot
      ? null
      : retiredStoredPick(modelRequest, choice);
    return retiredPick === null ? choice : { ...choice, retiredPick };
  }

  /**
   * Clears a retired stored pick, keeping the stored intent, once the turn that
   * reported it has delivered the report, so the notice shows once. Best-effort:
   * a failed write is logged and never rejects.
   */
  async forgetRetiredPick(userId: string, model: string): Promise<void> {
    try {
      await this.settings.clearPreferredModel(userId, model);
    } catch (error) {
      this.logger.warn({
        event: 'ai.preferences.retired_pick_clear_failed',
        userId,
        model,
        error: reasonOf(error),
      });
    }
  }

  /**
   * The stored preferences as a turn reads them, so every surface shows what a
   * turn serves: a primary provider only while the caller holds its key, and a
   * stored platform model as the intent it serves. The tier is read, once and
   * through `tierOf`, only when one of those needs it; when it cannot be
   * resolved the stored row is answered as is.
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
    const platformIntents = preferredModel
      ? await this.aiConfig.getIntentModels()
      : null;
    // A platform catalog lists only the configured intent models, so any other
    // pick reads as stored without touching the key store behind the tier.
    const intentModels =
      platformIntents !== null &&
      preferredModel !== null &&
      Object.values(platformIntents).includes(preferredModel)
        ? platformIntents
        : null;
    if (intentModels === null && primaryProvider === null) {
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
    const held: AIPreferences = {
      ...stored,
      primaryProvider:
        primaryProvider !== null && execution.byokProviders.has(primaryProvider)
          ? primaryProvider
          : null,
    };
    return intentModels === null
      ? held
      : servedPreference(
          this.scopeOf(execution, intentModels, held.primaryProvider).catalog,
          held
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
    const [platformIntents, primaryProvider] = await Promise.all([
      this.aiConfig.getIntentModels(),
      patch.primaryProvider === undefined
        ? this.storedPrimaryOf(execution)
        : patch.primaryProvider,
    ]);
    const { catalog, facts } = this.scopeOf(
      execution,
      platformIntents,
      primaryProvider
    );
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

  // The primary provider only orders routes over the caller's own keys, so no
  // other catalog reads it.
  private async storedPrimaryOf(
    execution: AiExecutionContext
  ): Promise<ByokProvider | null> {
    if (execution.policy.catalog !== CATALOG_SCOPE.OWN_KEYS) {
      return null;
    }
    const { primaryProvider } = await this.settings.getSettings(
      execution.subject.userId
    );
    return primaryProvider;
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
