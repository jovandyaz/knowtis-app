import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import {
  AI_USAGE_REPOSITORY,
  type AIUsageRepository,
} from '../../domain/ports/ai-usage.repository';
import type {
  EmbeddingPort,
  EmbeddingResult,
} from '../../domain/ports/embedding.port';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const OUTPUT_DIMENSION = 1024;
const EMBEDDING_USAGE_ACTION = 'agent-embedding';
// TODO(verify): confirm voyage-4 price/1M tokens against Voyage pricing docs.
const PRICE_PER_1M_TOKENS_USD = 0.12;

@Injectable()
export class VoyageEmbeddingAdapter implements EmbeddingPort {
  private readonly logger = new Logger(VoyageEmbeddingAdapter.name);

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    @Inject(AI_USAGE_REPOSITORY)
    private readonly usage: AIUsageRepository
  ) {}

  async embedQuery(text: string): Promise<number[]> {
    const { embeddings } = await this.call([text], 'query');
    return embeddings[0];
  }

  async embedDocuments(texts: string[]): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokens: 0 };
    }
    const { embeddings, totalTokens } = await this.call(texts, 'document');
    await this.recordUsage(totalTokens);
    return { embeddings, totalTokens };
  }

  private async call(
    input: string[],
    inputType: 'query' | 'document'
  ): Promise<{ embeddings: number[][]; totalTokens: number }> {
    const apiKey = this.config.get('VOYAGE_API_KEY');
    if (!apiKey) {
      throw new Error('VOYAGE_API_KEY is not set');
    }
    const model = this.config.get('AI_EMBEDDING_MODEL');

    const response = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input,
        model,
        input_type: inputType,
        output_dimension: OUTPUT_DIMENSION,
        output_dtype: 'float',
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Voyage embeddings failed (${response.status}): ${detail}`
      );
    }

    const json = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
      usage?: { total_tokens?: number };
    };
    const embeddings = [...json.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    return { embeddings, totalTokens: json.usage?.total_tokens ?? 0 };
  }

  private async recordUsage(totalTokens: number): Promise<void> {
    try {
      await this.usage.recordUsage({
        userId: 'system',
        action: EMBEDDING_USAGE_ACTION,
        model: this.config.get('AI_EMBEDDING_MODEL'),
        inputTokens: totalTokens,
        outputTokens: 0,
        costUsd: (totalTokens / 1_000_000) * PRICE_PER_1M_TOKENS_USD,
      });
    } catch (error) {
      this.logger.warn(
        'Failed to record embedding usage',
        error instanceof Error ? error.stack : String(error)
      );
    }
  }
}
