import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import type {
  EmbeddingPort,
  EmbeddingResult,
} from '../../domain/ports/embedding.port';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const OUTPUT_DIMENSION = 1024;
// TODO(verify): confirm voyage-4 price/1M tokens against Voyage pricing docs.
const PRICE_PER_1M_TOKENS_USD = 0.12;

@Injectable()
export class VoyageEmbeddingAdapter implements EmbeddingPort {
  private readonly logger = new Logger(VoyageEmbeddingAdapter.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async embedQuery(text: string): Promise<number[]> {
    const { embeddings } = await this.call([text], 'query');
    return embeddings[0];
  }

  async embedDocuments(texts: string[]): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokens: 0 };
    }
    return this.call(texts, 'document');
  }

  private async call(
    input: string[],
    inputType: 'query' | 'document'
  ): Promise<EmbeddingResult> {
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
    const totalTokens = json.usage?.total_tokens ?? 0;
    this.logCost(inputType, totalTokens);
    return { embeddings, totalTokens };
  }

  private logCost(inputType: 'query' | 'document', totalTokens: number): void {
    const costUsd = (totalTokens / 1_000_000) * PRICE_PER_1M_TOKENS_USD;
    this.logger.log(
      `Voyage embedding (${inputType}): ${totalTokens} tokens ~= $${costUsd.toFixed(6)}`
    );
  }
}
