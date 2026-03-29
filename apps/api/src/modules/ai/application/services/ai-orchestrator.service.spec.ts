import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import { SUPPORTED_AI_ACTIONS } from '../../domain/value-objects/ai-action.vo';
import type { AIConfigService } from './ai-config.service';
import { AIOrchestrator } from './ai-orchestrator.service';

function createMockAIConfigService(
  overrides?: Partial<
    Record<'getDefaultModel' | 'getFastModel' | 'getFallbackModel', string>
  >
): AIConfigService {
  return {
    getDefaultModel: vi
      .fn()
      .mockResolvedValue(
        overrides?.getDefaultModel ?? 'anthropic:claude-sonnet-4-20250514'
      ),
    getFastModel: vi
      .fn()
      .mockResolvedValue(
        overrides?.getFastModel ?? 'anthropic:claude-haiku-4-5-20251001'
      ),
    getFallbackModel: vi
      .fn()
      .mockResolvedValue(
        overrides?.getFallbackModel ?? 'anthropic:claude-haiku-4-5-20251001'
      ),
    getAllConfig: vi.fn().mockResolvedValue({}),
    setConfig: vi.fn().mockResolvedValue(undefined),
  } as unknown as AIConfigService;
}

describe('AIOrchestrator', () => {
  let orchestrator: AIOrchestrator;

  beforeEach(() => {
    const mockAIConfigService = createMockAIConfigService();
    orchestrator = new AIOrchestrator(mockAIConfigService);
  });

  it('should route ghost-text to fast model', async () => {
    const result = await orchestrator.selectModel(AI_ACTION.GHOST_TEXT);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().toPrimitive()).toBe(
      'anthropic:claude-haiku-4-5-20251001'
    );
  });

  it('should route summarize to default model', async () => {
    const result = await orchestrator.selectModel(AI_ACTION.SUMMARIZE);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().toPrimitive()).toBe(
      'anthropic:claude-sonnet-4-20250514'
    );
  });

  it('should route expand to default model', async () => {
    const result = await orchestrator.selectModel(AI_ACTION.EXPAND);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().toPrimitive()).toBe(
      'anthropic:claude-sonnet-4-20250514'
    );
  });

  it('should return err for unsupported model from config', async () => {
    const badAIConfigService = createMockAIConfigService({
      getDefaultModel: 'gpt-4o',
      getFastModel: 'gpt-4o',
    });
    const orch = new AIOrchestrator(badAIConfigService);
    const result = await orch.selectModel(AI_ACTION.SUMMARIZE);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('AI_INVALID_MODEL');
  });

  it('should generate system prompt for summarize', () => {
    const prompt = orchestrator.getSystemPrompt(AI_ACTION.SUMMARIZE);
    expect(prompt).toContain('ummar');
  });

  it('should generate system prompt for ghost-text with FIM rules', () => {
    const prompt = orchestrator.getSystemPrompt(AI_ACTION.GHOST_TEXT);
    expect(prompt).toContain('autocomplete');
    expect(prompt).toContain('Do NOT repeat');
    expect(prompt).toContain('prefix or suffix');
  });

  it.each(
    SUPPORTED_AI_ACTIONS.filter((a) => a !== AI_ACTION.VOICE_TRANSCRIPTION)
  )('should have a system prompt for action: %s', (action) => {
    const prompt = orchestrator.getSystemPrompt(action);
    expect(prompt).toBeTruthy();
    expect(typeof prompt).toBe('string');
  });

  it('should have an empty system prompt for voice-transcription (handled by Whisper)', () => {
    const prompt = orchestrator.getSystemPrompt(AI_ACTION.VOICE_TRANSCRIPTION);
    expect(prompt).toBe('');
  });

  it.each([
    AI_ACTION.SUMMARIZE,
    AI_ACTION.EXPAND,
    AI_ACTION.TONE,
    AI_ACTION.OUTLINE,
    AI_ACTION.ACTION_ITEMS,
    AI_ACTION.CHAT,
    AI_ACTION.IMPROVE_WRITING,
    AI_ACTION.FIX_SPELLING,
    AI_ACTION.MAKE_SHORTER,
    AI_ACTION.MAKE_LONGER,
  ] as const)(
    'should include language preservation instruction for %s',
    (action) => {
      const prompt = orchestrator.getSystemPrompt(action);
      expect(prompt).toContain('Detect the language of the input text');
      expect(prompt).toContain('SAME language');
    }
  );

  it.each([AI_ACTION.TRANSLATE, AI_ACTION.GHOST_TEXT] as const)(
    'should NOT include language preservation instruction for %s',
    (action) => {
      const prompt = orchestrator.getSystemPrompt(action);
      expect(prompt).not.toContain('Detect the language of the input text');
    }
  );

  it.each([
    AI_ACTION.IMPROVE_WRITING,
    AI_ACTION.FIX_SPELLING,
    AI_ACTION.MAKE_SHORTER,
    AI_ACTION.MAKE_LONGER,
  ] as const)('should route %s to default model', async (action) => {
    const result = await orchestrator.selectModel(action);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().toPrimitive()).toBe(
      'anthropic:claude-sonnet-4-20250514'
    );
  });

  describe('buildUserPrompt', () => {
    it('should return content as-is for plain actions', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Some text' },
        AI_ACTION.SUMMARIZE
      );
      expect(result).toBe('Some text');
    });

    it('should prefer selection over content', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Full doc', selection: 'Selected part' },
        AI_ACTION.SUMMARIZE
      );
      expect(result).toBe('Selected part');
    });

    it('should build translate prompt with target language', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Hello world', targetLanguage: 'Spanish' },
        AI_ACTION.TRANSLATE
      );
      expect(result).toBe('Translate to Spanish:\n\nHello world');
    });

    it('should build tone prompt with target tone', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Hey there', targetTone: 'formal' },
        AI_ACTION.TONE
      );
      expect(result).toBe('Rewrite in a formal tone:\n\nHey there');
    });

    it('should use selection for translate when both provided', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Full doc', selection: 'Part', targetLanguage: 'French' },
        AI_ACTION.TRANSLATE
      );
      expect(result).toBe('Translate to French:\n\nPart');
    });

    it('should ignore targetLanguage for non-translate actions', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Text', targetLanguage: 'Spanish' },
        AI_ACTION.SUMMARIZE
      );
      expect(result).toBe('Text');
    });

    it('should build ghost-text prompt with prefix-only when no suffix', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'The quick brown fox' },
        AI_ACTION.GHOST_TEXT
      );
      expect(result).toContain('[TEXT BEFORE CURSOR]');
      expect(result).toContain('The quick brown fox');
      expect(result).toContain('[CURSOR - INSERT HERE]');
      expect(result).not.toContain('[TEXT AFTER CURSOR]');
    });

    it('should build ghost-text prompt with prefix and suffix', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'The quick brown', suffix: 'over the lazy dog.' },
        AI_ACTION.GHOST_TEXT
      );
      expect(result).toContain('[TEXT BEFORE CURSOR]');
      expect(result).toContain('The quick brown');
      expect(result).toContain('[CURSOR - INSERT HERE]');
      expect(result).toContain('[TEXT AFTER CURSOR]');
      expect(result).toContain('over the lazy dog.');
    });

    it('should ignore selection for ghost-text and use content as prefix', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Prefix text', selection: 'Selected text' },
        AI_ACTION.GHOST_TEXT
      );
      expect(result).toContain('Prefix text');
      expect(result).not.toContain('Selected text');
    });
  });
});
