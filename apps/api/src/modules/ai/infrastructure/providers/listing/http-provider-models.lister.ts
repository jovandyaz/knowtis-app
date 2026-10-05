import { Injectable } from '@nestjs/common';

import type { AIProvider } from '@knowtis/shared-types';

import type {
  ProviderListing,
  ProviderModelsLister,
} from '../../../domain/ports/provider-models.port';
import { AnthropicModelsClient } from './anthropic-models.client';
import { GoogleModelsClient } from './google-models.client';
import { boundedListing, type ProviderModelsClient } from './listing-http';
import { OpenAIModelsClient } from './openai-models.client';
import { OpenRouterKeyModelsClient } from './openrouter-key-models.client';

/** Lists a key's models over each provider's HTTP API, bounded and redacted by `boundedListing`. */
@Injectable()
export class HttpProviderModelsLister implements ProviderModelsLister {
  private readonly clients: Readonly<Record<AIProvider, ProviderModelsClient>> =
    {
      anthropic: new AnthropicModelsClient(),
      openai: new OpenAIModelsClient(),
      google: new GoogleModelsClient(),
      openrouter: new OpenRouterKeyModelsClient(),
    };

  list(provider: AIProvider, apiKey: string): Promise<ProviderListing> {
    return boundedListing(apiKey, (signal, keyAccepted) =>
      this.clients[provider].list(apiKey, signal, keyAccepted)
    );
  }
}
