import { LiteLLMCatalog, type ModelCatalog } from '@knowtis/ai-gateway';

const TEST_PRICES = {
  'claude-sonnet-4-20250514': {
    litellm_provider: 'anthropic',
    mode: 'chat',
    input_cost_per_token: 0.000003,
    output_cost_per_token: 0.000015,
    cache_read_input_token_cost: 3e-7,
    cache_creation_input_token_cost: 0.00000375,
    max_input_tokens: 200000,
    max_output_tokens: 64000,
  },
  'claude-haiku-4-5-20251001': {
    litellm_provider: 'anthropic',
    mode: 'chat',
    input_cost_per_token: 8e-7,
    output_cost_per_token: 0.000004,
    cache_read_input_token_cost: 8e-8,
    cache_creation_input_token_cost: 0.000001,
  },
  'gemini/gemini-2.0-flash': {
    litellm_provider: 'gemini',
    mode: 'chat',
    input_cost_per_token: 1e-7,
    output_cost_per_token: 4e-7,
  },
  'gemini/gemini-2.5-pro': {
    litellm_provider: 'gemini',
    mode: 'chat',
    input_cost_per_token: 0.00000125,
    output_cost_per_token: 0.00001,
  },
  'whisper-1': {
    litellm_provider: 'openai',
    mode: 'audio_transcription',
    input_cost_per_second: 0.0001,
  },
};

export function createTestCatalog(): ModelCatalog {
  return new LiteLLMCatalog(TEST_PRICES);
}
