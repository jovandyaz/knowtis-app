import { describe, expect, it } from 'vitest';

import type { IndexedModel } from './indexed-model';
import { ModelIndexCatalog } from './model-index-catalog';

const SONNET: IndexedModel = {
  id: 'anthropic:claude-sonnet-5-5',
  provider: 'anthropic',
  name: 'Claude Sonnet 5.5',
  family: 'claude-sonnet',
  releasedAt: '2026-09-28',
  status: 'active',
  toolCall: true,
  structuredOutput: true,
  inputModalities: ['text', 'image', 'pdf'],
  outputModalities: ['text'],
  inputCostPerToken: 2e-6,
  outputCostPerToken: 1e-5,
  cacheReadCostPerToken: 2e-7,
  cacheWriteCostPerToken: 2.5e-6,
  maxInputTokens: 1000000,
  maxOutputTokens: 128000,
  reasoning: {
    levels: ['low', 'medium', 'high', 'xhigh', 'max'],
    mandatory: true,
  },
  canonical: 'anthropic/claude-sonnet-5-5',
  openWeights: false,
  retiresAt: null,
  source: 'models_dev',
};

const GPT_IMAGE: IndexedModel = {
  ...SONNET,
  id: 'openai:gpt-image-1',
  provider: 'openai',
  name: 'gpt-image-1',
  inputModalities: ['text', 'image'],
  outputModalities: ['image'],
  inputCostPerToken: null,
  outputCostPerToken: null,
  cacheReadCostPerToken: null,
  cacheWriteCostPerToken: null,
  maxInputTokens: null,
  maxOutputTokens: null,
};

const GEMINI_IMAGE: IndexedModel = {
  ...SONNET,
  id: 'google:gemini-3.1-flash-image',
  provider: 'google',
  inputModalities: ['text', 'image'],
  outputModalities: ['text', 'image'],
};

const TTS: IndexedModel = {
  ...SONNET,
  id: 'google:gemini-3.1-flash-tts-preview',
  provider: 'google',
  inputModalities: ['text'],
  outputModalities: ['audio'],
};

const SPEECH_INPUT: IndexedModel = {
  ...SONNET,
  id: 'openai:gpt-4o-transcribe',
  provider: 'openai',
  inputModalities: ['audio'],
  outputModalities: ['text'],
};

const DEEPSEEK_ROUTE: IndexedModel = {
  ...SONNET,
  id: 'openrouter:deepseek/deepseek-v4-pro-0813',
  provider: 'openrouter',
  inputCostPerToken: 2.2e-7,
  outputCostPerToken: 4.2e-6,
  cacheReadCostPerToken: 1.4e-7,
  cacheWriteCostPerToken: null,
  source: 'openrouter',
};

const WHISPER_AS_TEXT_ROW: IndexedModel = {
  ...SONNET,
  id: 'openai:whisper-1',
  provider: 'openai',
};

const catalog = new ModelIndexCatalog([
  SONNET,
  GPT_IMAGE,
  GEMINI_IMAGE,
  TTS,
  SPEECH_INPUT,
  DEEPSEEK_ROUTE,
]);

describe('ModelIndexCatalog', () => {
  describe('isSupported', () => {
    it('supports an indexed text-in, text-out model', () => {
      expect(catalog.isSupported('anthropic:claude-sonnet-5-5')).toBe(true);
    });

    it('supports a model that answers with text alongside images', () => {
      expect(catalog.isSupported('google:gemini-3.1-flash-image')).toBe(true);
    });

    it('rejects a model whose output lacks text', () => {
      expect(catalog.isSupported('openai:gpt-image-1')).toBe(false);
      expect(catalog.isSupported('google:gemini-3.1-flash-tts-preview')).toBe(
        false
      );
    });

    it('rejects a model whose input lacks text', () => {
      expect(catalog.isSupported('openai:gpt-4o-transcribe')).toBe(false);
    });

    it('rejects an unknown id', () => {
      expect(catalog.isSupported('anthropic:claude-2')).toBe(false);
    });

    it('never supports a transcription model even though it is priced', () => {
      expect(catalog.isSupported('openai:whisper-1')).toBe(false);
    });

    it('never supports a transcription model even when indexed with text modalities', () => {
      const withWhisperRow = new ModelIndexCatalog([WHISPER_AS_TEXT_ROW]);

      expect(withWhisperRow.isSupported('openai:whisper-1')).toBe(false);
    });
  });

  describe('getPricing', () => {
    it('maps cache read and cache write onto the port pricing fields', () => {
      expect(catalog.getPricing('anthropic:claude-sonnet-5-5')).toEqual({
        inputCostPerToken: 2e-6,
        outputCostPerToken: 1e-5,
        cacheReadInputTokenCost: 2e-7,
        cacheCreationInputTokenCost: 2.5e-6,
      });
    });

    it('reports a missing cost as an undefined field', () => {
      const pricing = catalog.getPricing(
        'openrouter:deepseek/deepseek-v4-pro-0813'
      );

      expect(pricing?.cacheReadInputTokenCost).toBe(1.4e-7);
      expect(pricing).toHaveProperty('cacheCreationInputTokenCost', undefined);
    });

    it('reports every cost undefined for an unpriced model', () => {
      expect(catalog.getPricing('openai:gpt-image-1')).toEqual({
        inputCostPerToken: undefined,
        outputCostPerToken: undefined,
        cacheReadInputTokenCost: undefined,
        cacheCreationInputTokenCost: undefined,
      });
    });

    it('prices whisper per second of audio', () => {
      expect(catalog.getPricing('openai:whisper-1')).toEqual({
        inputCostPerSecond: 0.0001,
      });
    });

    it('keeps the per-second price when the index also lists the transcription model', () => {
      const withWhisperRow = new ModelIndexCatalog([WHISPER_AS_TEXT_ROW]);

      expect(withWhisperRow.getPricing('openai:whisper-1')).toEqual({
        inputCostPerSecond: 0.0001,
      });
    });

    it('returns undefined for an unknown id', () => {
      expect(catalog.getPricing('anthropic:claude-2')).toBeUndefined();
      expect(catalog.getPricing('toString')).toBeUndefined();
    });
  });

  describe('getContextWindow', () => {
    it('reports the input and output limits', () => {
      expect(catalog.getContextWindow('anthropic:claude-sonnet-5-5')).toEqual({
        maxInputTokens: 1000000,
        maxOutputTokens: 128000,
      });
    });

    it('reports unknown limits as undefined', () => {
      expect(catalog.getContextWindow('openai:gpt-image-1')).toEqual({
        maxInputTokens: undefined,
        maxOutputTokens: undefined,
      });
    });

    it('returns undefined for an unknown id', () => {
      expect(catalog.getContextWindow('anthropic:claude-2')).toBeUndefined();
    });
  });

  describe('lookup', () => {
    it('returns the indexed row by id', () => {
      expect(catalog.get('openai:gpt-image-1')).toBe(GPT_IMAGE);
      expect(catalog.get('anthropic:claude-2')).toBeUndefined();
    });

    it('lists every indexed row and counts them', () => {
      expect(catalog.all()).toEqual([
        SONNET,
        GPT_IMAGE,
        GEMINI_IMAGE,
        TTS,
        SPEECH_INPUT,
        DEEPSEEK_ROUTE,
      ]);
      expect(catalog.size).toBe(6);
    });

    it('keeps the last row when an id repeats', () => {
      const repriced = { ...SONNET, inputCostPerToken: 3e-6 };
      const deduped = new ModelIndexCatalog([SONNET, repriced]);

      expect(deduped.size).toBe(1);
      expect(deduped.all()).toEqual([repriced]);
      expect(deduped.getPricing(SONNET.id)?.inputCostPerToken).toBe(3e-6);
    });
  });
});
