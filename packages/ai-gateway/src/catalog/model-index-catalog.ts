import type { IndexedModel } from './indexed-model';
import type {
  ModelCatalog,
  ModelContextWindow,
  ModelPricing,
} from './model-catalog';
import { TRANSCRIPTION_PRICES } from './transcription-prices';

const TEXT_MODALITY = 'text';

/** Synchronous `ModelCatalog` over a snapshot of the model index. A repeated id keeps its last row. */
export class ModelIndexCatalog implements ModelCatalog {
  private readonly models: ReadonlyMap<string, IndexedModel>;
  private readonly rows: readonly IndexedModel[];

  constructor(models: readonly IndexedModel[]) {
    this.models = new Map(models.map((model) => [model.id, model]));
    this.rows = [...this.models.values()];
  }

  get size(): number {
    return this.models.size;
  }

  /** Indexed (listed) and text in, text out. Transcription models are priced but never supported. */
  isSupported(modelId: string): boolean {
    if (isTranscriptionModel(modelId)) {
      return false;
    }
    const model = this.models.get(modelId);
    return (
      model !== undefined &&
      model.inputModalities.includes(TEXT_MODALITY) &&
      model.outputModalities.includes(TEXT_MODALITY)
    );
  }

  /** Token prices of an indexed model, or the per-second price of a transcription model. */
  getPricing(modelId: string): ModelPricing | undefined {
    if (isTranscriptionModel(modelId)) {
      return { inputCostPerSecond: TRANSCRIPTION_PRICES[modelId] };
    }
    const model = this.models.get(modelId);
    if (model === undefined) {
      return undefined;
    }
    return {
      inputCostPerToken: model.inputCostPerToken ?? undefined,
      outputCostPerToken: model.outputCostPerToken ?? undefined,
      cacheReadInputTokenCost: model.cacheReadCostPerToken ?? undefined,
      cacheCreationInputTokenCost: model.cacheWriteCostPerToken ?? undefined,
    };
  }

  getContextWindow(modelId: string): ModelContextWindow | undefined {
    const model = this.models.get(modelId);
    if (model === undefined) {
      return undefined;
    }
    return {
      maxInputTokens: model.maxInputTokens ?? undefined,
      maxOutputTokens: model.maxOutputTokens ?? undefined,
    };
  }

  get(modelId: string): IndexedModel | undefined {
    return this.models.get(modelId);
  }

  all(): readonly IndexedModel[] {
    return this.rows;
  }
}

function isTranscriptionModel(modelId: string): boolean {
  return Object.hasOwn(TRANSCRIPTION_PRICES, modelId);
}
